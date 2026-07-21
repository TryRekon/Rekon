import type { MessageCreateParams } from '@anthropic-ai/sdk/resources/messages'
import { sha256Hex } from '../../db/hash'
import {
  estimateTokens,
  serializeContent,
  truncateForStorage,
  type ToolResult,
} from '../../db/tool-calls'
import type { ToolDef, Toolset } from '../../db/tools'
import type { RequestSignals } from '../../db/usage'

// Anthropic-specific signal extraction. The Messages API is stateless: no
// conversation ID comes back, and replayed assistant turns don't carry their
// original `msg_` ids. The request body yields three signals:
//
// 1. metadata — Claude Code sends `metadata.user_id` carrying its session
//    UUID, an exact per-conversation key. Two wire formats have shipped: a
//    JSON-encoded object with a `session_id` field (current), and an
//    underscore-delimited `user_<hash>_account_<uuid>_session_<uuid>` string
//    (legacy). A user id without a session component is deliberately NOT
//    used: it would merge every chat by that user.
// 2. chain — turn N+1 of any conversation replays turn N's assistant reply
//    verbatim; hashing the replayed last assistant turn yields a key that
//    matches the `response_key` recorded for the response that produced it.
// 3. tool results — `tool_result` blocks after the last assistant turn are
//    the NEW results being returned this turn (earlier ones are old history,
//    already recorded on a previous pass). They complete the tool_calls rows
//    opened when the tool_use response was recorded.
// 4. user text — text blocks in the same post-assistant window are the NEW
//    user-typed content this turn (on turn 1 the window is the whole prompt).
// 5. toolset — the request's `tools` array carries the full definitions the
//    client exposes; each is hashed and token-estimated for the per-system
//    tool registry (src/db/tools.ts).

const SESSION_MARKER = /session[_-]([0-9a-fA-F][0-9a-fA-F-]{15,})/

const extractClientKey = (userId: string): string | null => {
  try {
    const parsed = JSON.parse(userId) as { session_id?: unknown }
    if (typeof parsed?.session_id === 'string' && parsed.session_id) {
      return parsed.session_id
    }
  } catch {
    // not JSON — legacy underscore-delimited format
  }
  return SESSION_MARKER.exec(userId)?.[1] ?? null
}

// Canonical key for assistant content, computable identically from a parsed
// response and from the client's replay of it in the next request. Only text
// bodies and tool_use ids participate — tool_use ids (`toolu_...`) are unique
// and must be replayed verbatim, making them strong chain anchors; thinking
// and other block types are ignored since clients may drop or rewrite them.
export const contentKey = async (content: unknown): Promise<string | null> => {
  if (typeof content === 'string') {
    return content ? sha256Hex(`t:${content}`) : null
  }
  if (!Array.isArray(content)) return null

  const parts: string[] = []
  for (const block of content as Array<{ type?: string; text?: string; id?: string }>) {
    if (block?.type === 'text' && block.text) parts.push(`t:${block.text}`)
    else if (block?.type === 'tool_use' && block.id) parts.push(`u:${block.id}`)
  }
  return parts.length ? sha256Hex(parts.join('\n')) : null
}

type ResultBlock = {
  type?: string
  text?: string
  tool_use_id?: string
  content?: unknown
  is_error?: boolean
}

// tool_result content is string | block[]; images become a media-type-tagged
// placeholder (see serializeContent).
const imagePlaceholder = (block: { type?: string; source?: { media_type?: string } }) =>
  block?.type === 'image' ? `[image ${block.source?.media_type ?? 'unknown'}]` : null

// Tool entries are `ToolUnion` — custom tools carry description +
// input_schema, server tools ({type, name}) only a name; anything nameless is
// skipped. Stored text is truncated; hashes and token estimates use the full
// serialized entry. The toolset hash is order-sensitive — clients send tools
// in a stable order, and a reorder changing the prompt is a real change.
const extractToolset = async (toolsParam: unknown): Promise<Toolset | null> => {
  if (!Array.isArray(toolsParam)) return null

  const defs: ToolDef[] = []
  const serializedEntries: string[] = []
  for (const entry of toolsParam as Array<{
    name?: unknown
    description?: unknown
    input_schema?: unknown
  }>) {
    if (typeof entry?.name !== 'string' || !entry.name) continue
    const serialized = JSON.stringify(entry)
    serializedEntries.push(serialized)
    defs.push({
      name: entry.name,
      description:
        typeof entry.description === 'string' ? truncateForStorage(entry.description) : null,
      inputSchema:
        entry.input_schema === undefined
          ? null
          : truncateForStorage(JSON.stringify(entry.input_schema)),
      definitionTokens: estimateTokens(serialized.length),
      definitionHash: await sha256Hex(serialized),
    })
  }

  if (!defs.length) return null
  return { toolsetHash: await sha256Hex(serializedEntries.join('\n')), defs }
}

// Claude Code (and SDK clients) fire a background title-generation request —
// tagged `generate_session_title` internally — that carries this session's
// `metadata.user_id`, so it lands here under the same session. Its response is
// a single-key JSON object and nothing else: `{"title": "..."}` from the CLI,
// `{"name": "..."}` from the Remote-Control/SDK variant. That shape on a tiny
// output is the only wire-visible signal — the request reuses the session's own
// model, and the "generate a title" instruction lives in the unrecorded
// `system` field. The strict parse (exactly one of {title, name}, non-empty
// string) is what keeps a normal turn that merely mentions "title" from being
// mistaken for one.
const TITLE_MAX_OUTPUT_TOKENS = 60

export const extractSessionTitle = (
  text: string | null,
  outputTokens: number | null,
): string | null => {
  if (!text) return null
  if (outputTokens != null && outputTokens > TITLE_MAX_OUTPUT_TOKENS) return null
  const trimmed = text.trim()
  if (trimmed[0] !== '{') return null

  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null

  const keys = Object.keys(parsed)
  if (keys.length !== 1 || (keys[0] !== 'title' && keys[0] !== 'name')) return null
  const value = (parsed as Record<string, unknown>)[keys[0]]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export const extractRequestSignals = async (requestBody: string | null): Promise<RequestSignals> => {
  const none: RequestSignals = {
    clientKey: null,
    chainKey: null,
    toolResults: [],
    userText: null,
    toolset: null,
  }
  if (!requestBody) return none

  let json: unknown
  try {
    json = JSON.parse(requestBody)
  } catch {
    return none
  }
  if (typeof json !== 'object' || json === null) return none

  const body = json as Partial<MessageCreateParams>

  const userId = body.metadata?.user_id
  const clientKey = typeof userId === 'string' ? extractClientKey(userId) : null

  const messages = Array.isArray(body.messages) ? body.messages : []
  let chainKey: string | null = null
  let lastAssistantIndex = -1
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]
    if (message?.role === 'assistant') {
      chainKey = await contentKey(message.content)
      lastAssistantIndex = i
      break
    }
  }

  const toolResults: ToolResult[] = []
  const userTexts: string[] = []
  for (const message of messages.slice(lastAssistantIndex + 1)) {
    if (message?.role !== 'user') continue
    if (typeof message.content === 'string') {
      if (message.content) userTexts.push(message.content)
      continue
    }
    if (!Array.isArray(message.content)) continue
    for (const block of message.content as ResultBlock[]) {
      if (block?.type === 'text' && typeof block.text === 'string' && block.text) {
        userTexts.push(block.text)
        continue
      }
      if (block?.type !== 'tool_result' || typeof block.tool_use_id !== 'string') continue
      const { text, tokens } = serializeContent(block.content, imagePlaceholder)
      toolResults.push({
        toolUseId: block.tool_use_id,
        output: truncateForStorage(text),
        outputTokens: tokens,
        isError: block.is_error === true,
      })
    }
  }
  const userText = userTexts.length ? truncateForStorage(userTexts.join('\n\n')) : null

  const toolset = await extractToolset(body.tools)

  return { clientKey, chainKey, toolResults, userText, toolset }
}
