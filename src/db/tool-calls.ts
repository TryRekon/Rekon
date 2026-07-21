import { drizzle } from 'drizzle-orm/d1'
import { and, eq, inArray, isNull } from 'drizzle-orm'
import { sessions, toolCalls } from './schema'

// Provider-agnostic tool call persistence. Each provider module extracts
// tool_use blocks from its responses and tool_result payloads from its
// requests; this module records the two phases:
//
// 1. recordToolUses — the response invoked tools: insert rows with func +
//    input, output still pending.
// 2. attachToolResults — a later request replayed the results: fill in
//    output on the matching row. The `output IS NULL` guard makes replayed
//    history idempotent, and results for tool uses the proxy never saw are
//    dropped rather than inserted as orphans.

type Db = ReturnType<typeof drizzle>

// Providers report token usage per request, never per content block, so tool
// call costs are estimates: ~4 chars per token for text/JSON, and a flat rate
// for images (base64 length wildly overstates what vision tokenizers count).
export const estimateTokens = (chars: number): number => Math.ceil(chars / 4)
const IMAGE_TOKEN_ESTIMATE = 1500

// Content is string | block[] (a tool_result's content, or a user/tool message
// body). Text is kept verbatim and char-estimated; images are swapped for a
// caller-supplied placeholder and counted at the flat rate. `imagePlaceholder`
// returns the placeholder for an image block (the discriminant and label are
// provider-specific) or null for any block that isn't an image.
export const serializeContent = (
  content: unknown,
  imagePlaceholder: (block: { type?: string; source?: { media_type?: string } }) => string | null,
): { text: string; tokens: number } => {
  if (typeof content === 'string') {
    return { text: content, tokens: estimateTokens(content.length) }
  }
  if (!Array.isArray(content)) return { text: '', tokens: 0 }

  const parts: string[] = []
  let tokens = 0
  for (const block of content as Array<{ type?: string; text?: string }>) {
    if (block?.type === 'text' && typeof block.text === 'string') {
      parts.push(block.text)
      tokens += estimateTokens(block.text.length)
      continue
    }
    const placeholder = imagePlaceholder(block)
    if (placeholder !== null) {
      parts.push(placeholder)
      tokens += IMAGE_TOKEN_ESTIMATE
    }
  }
  return { text: parts.join('\n'), tokens }
}

// Stored payloads are previews; token estimates are computed from the full
// serialized size before truncation.
const MAX_STORED_CHARS = 8_000
export const truncateForStorage = (value: string): string =>
  value.length > MAX_STORED_CHARS ? `${value.slice(0, MAX_STORED_CHARS)}…[truncated]` : value

export type ToolUse = {
  toolUseId: string
  func: string
  input: string | null
  inputTokens: number | null
}

export type ToolResult = {
  toolUseId: string
  output: string
  outputTokens: number
  isError: boolean
}

export const recordToolUses = async (
  db: Db,
  providerId: string,
  sessionId: string,
  requestId: number,
  uses: ToolUse[],
): Promise<void> => {
  if (!uses.length) return
  const now = new Date()
  await db.insert(toolCalls).values(
    uses.map((use) => ({
      createdAt: now,
      providerId,
      sessionId,
      requestId,
      toolUseId: use.toolUseId,
      func: use.func,
      input: use.input,
      inputTokens: use.inputTokens,
    })),
  )
}

export const attachToolResults = async (
  db: Db,
  providerId: string,
  systemId: string,
  resultRequestId: number,
  results: ToolResult[],
  newInputTokens: number | null,
): Promise<void> => {
  // Delta attribution: `newInputTokens` is the EXACT number of tokens this
  // request added to the conversation (derived from the provider's per-request
  // usage vs the parent's). Scaling each result's char-based estimate by its
  // share of the delta replaces guesswork with real counts, split
  // proportionally. Assumes tool results dominate the turn's new content —
  // true in tool-use loops. Skipped when the delta is missing or non-positive
  // (history rewrite / dropped thinking), leaving the raw estimate.
  const totalEstimate = results.reduce((sum, result) => sum + result.outputTokens, 0)
  const scale =
    newInputTokens != null && newInputTokens > 0 && totalEstimate > 0
      ? newInputTokens / totalEstimate
      : null

  // toolUseIds are client-replayed, so the match is fenced to the request's
  // own system — a foreign tenant echoing a known id must not complete (or
  // overwrite) someone else's pending call.
  const systemSessions = db
    .select({ id: sessions.id })
    .from(sessions)
    .where(eq(sessions.systemId, systemId))

  for (const result of results) {
    await db
      .update(toolCalls)
      .set({
        output: result.output,
        outputTokens:
          scale == null ? result.outputTokens : Math.round(result.outputTokens * scale),
        isError: result.isError,
        resultRequestId,
      })
      .where(
        and(
          eq(toolCalls.providerId, providerId),
          eq(toolCalls.toolUseId, result.toolUseId),
          isNull(toolCalls.output),
          inArray(toolCalls.sessionId, systemSessions),
        ),
      )
  }
}
