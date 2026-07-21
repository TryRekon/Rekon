import type { ChatCompletionCreateParams } from 'openai/resources/chat/completions'
import { sha256Hex } from '../../db/hash'
import {
  estimateTokens,
  serializeContent,
  truncateForStorage,
  type ToolResult,
} from '../../db/tool-calls'
import type { ToolDef, Toolset } from '../../db/tools'
import type { RequestSignals } from '../../db/usage'

// OpenAI-specific signal extraction for Chat Completions. Like Anthropic's
// Messages API, `/v1/chat/completions` is stateless — no conversation ID comes
// back, and turn N+1 replays turn N's assistant message verbatim. The request
// body yields the same signal set as the Anthropic module:
//
// 1. metadata — there is no standard per-conversation key, but clients that
//    set `store: true` may send `metadata`; a `session_id`/`conversation_id`
//    entry is honored as an exact key. The `user` and `prompt_cache_key`
//    fields are deliberately NOT used: both are commonly per-user, and a
//    per-user key would merge every conversation by that user.
// 2. chain — hash of the replayed last assistant message, matched against the
//    `response_key` recorded when that response passed through.
// 3. tool results — `role: "tool"` messages after the last assistant turn are
//    the NEW results being returned this turn; they complete the tool_calls
//    rows opened when the tool_calls response was recorded.
// 4. user text — user messages in the same post-assistant window.
// 5. toolset — the request's `tools` array, hashed and token-estimated for
//    the per-system tool registry (src/db/tools.ts).

// Accepts both a response's `choices[0].message` (content: string | null,
// tool_calls) and the client's replayed assistant message (content may also be
// text-part array). Only text and tool_call ids participate — `call_...` ids
// must be replayed verbatim for the provider to match tool outputs, making
// them strong chain anchors; refusal/audio/reasoning fields are excluded since
// clients may drop or rewrite them. Text parts come before tool_call ids by
// construction on both sides, so the canonical order is stable.
export type AssistantContent = {
  content?: string | null | Array<{ type?: string; text?: string }>
  tool_calls?: Array<{ id?: string }> | null
}

export const contentKey = async (message: AssistantContent | null | undefined): Promise<string | null> => {
  if (!message) return null
  const parts: string[] = []
  if (typeof message.content === 'string') {
    if (message.content) parts.push(`t:${message.content}`)
  } else if (Array.isArray(message.content)) {
    for (const block of message.content) {
      if (block?.type === 'text' && block.text) parts.push(`t:${block.text}`)
    }
  }
  for (const call of message.tool_calls ?? []) {
    if (call?.id) parts.push(`u:${call.id}`)
  }
  return parts.length ? sha256Hex(parts.join('\n')) : null
}

// Message content is string | part[]; image_url parts become a flat placeholder
// (see serializeContent).
const imagePlaceholder = (block: { type?: string }) => (block?.type === 'image_url' ? '[image]' : null)

// Tool entries nest their definition under `function` (or `custom` for
// freeform tools); anything nameless is skipped. Stored text is truncated;
// hashes and token estimates use the full serialized entry. The toolset hash
// is order-sensitive — clients send tools in a stable order, and a reorder
// changing the prompt is a real change.
const extractToolset = async (toolsParam: unknown): Promise<Toolset | null> => {
  if (!Array.isArray(toolsParam)) return null

  const defs: ToolDef[] = []
  const serializedEntries: string[] = []
  for (const entry of toolsParam as Array<{
    function?: { name?: unknown; description?: unknown; parameters?: unknown }
    custom?: { name?: unknown; description?: unknown; format?: unknown }
  }>) {
    const def = entry?.function ?? entry?.custom
    if (typeof def?.name !== 'string' || !def.name) continue
    const schema = entry.function ? entry.function.parameters : entry.custom?.format
    const serialized = JSON.stringify(entry)
    serializedEntries.push(serialized)
    defs.push({
      name: def.name,
      description:
        typeof def.description === 'string' ? truncateForStorage(def.description) : null,
      inputSchema: schema === undefined ? null : truncateForStorage(JSON.stringify(schema)),
      definitionTokens: estimateTokens(serialized.length),
      definitionHash: await sha256Hex(serialized),
    })
  }

  if (!defs.length) return null
  return { toolsetHash: await sha256Hex(serializedEntries.join('\n')), defs }
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

  const body = json as Partial<ChatCompletionCreateParams>

  const metadata = body.metadata
  const metaKey = metadata?.session_id ?? metadata?.conversation_id
  const clientKey = typeof metaKey === 'string' && metaKey ? metaKey : null

  const messages = Array.isArray(body.messages) ? body.messages : []
  let chainKey: string | null = null
  let lastAssistantIndex = -1
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]
    if (message?.role === 'assistant') {
      chainKey = await contentKey(message)
      lastAssistantIndex = i
      break
    }
  }

  const toolResults: ToolResult[] = []
  const userTexts: string[] = []
  for (const message of messages.slice(lastAssistantIndex + 1)) {
    if (message?.role === 'tool' && typeof message.tool_call_id === 'string') {
      const { text, tokens } = serializeContent(message.content, imagePlaceholder)
      toolResults.push({
        toolUseId: message.tool_call_id,
        output: truncateForStorage(text),
        outputTokens: tokens,
        // Chat Completions has no error flag on tool messages.
        isError: false,
      })
    } else if (message?.role === 'user') {
      const { text } = serializeContent(message.content, imagePlaceholder)
      if (text) userTexts.push(text)
    }
  }
  const userText = userTexts.length ? truncateForStorage(userTexts.join('\n\n')) : null

  const toolset = await extractToolset(body.tools)

  return { clientKey, chainKey, toolResults, userText, toolset }
}
