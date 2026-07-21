import type { CompletionUsage } from 'openai/resources/completions'
import type { ChatCompletion, ChatCompletionChunk } from 'openai/resources/chat/completions'
import {
  persistUsage,
  type NormalizedUsage,
  type ParsedToolUse,
  type RequestMeta,
} from '../../db/usage'
import { contentKey, extractRequestSignals, type AssistantContent } from './session'

// Parse targets are the SDK's own wire types, so field renames/additions
// surface at typecheck when bumping the `openai` package (type-only imports —
// nothing from the SDK ends up in the bundle). Values are only recorded,
// never branched on, so optional chaining is the only runtime guard needed.
//
// Token normalization: OpenAI's `prompt_tokens` INCLUDES both cache reads
// (`prompt_tokens_details.cached_tokens`) and, on GPT-5.6+ models, the prompt
// tokens written to cache (`prompt_tokens_details.cache_write_tokens`) — unlike
// Anthropic's already-disjoint counts. Both are subtracted back out of
// inputTokens so the stored buckets stay disjoint (see NormalizedUsage) and
// promptSize/cost math is shared unchanged. cache_write_tokens maps to
// cacheCreationTokens and is billed at 1.25x input (the same
// CACHE_WRITE_MULTIPLIER the shared cost math applies to Anthropic writes);
// pre-5.6 models omit the field, leaving cacheCreationTokens null.

type ParsedResponse = {
  usage: NormalizedUsage
  message: AssistantContent
  toolUses: ParsedToolUse[]
  text: string | null
  stopReason: string | null
}

const normalizeUsage = (
  model: string | undefined,
  usage: CompletionUsage | null | undefined,
): NormalizedUsage => {
  if (!usage) return { model }
  const cached = usage.prompt_tokens_details?.cached_tokens ?? null
  const cacheWrite = usage.prompt_tokens_details?.cache_write_tokens ?? null
  return {
    model,
    inputTokens:
      usage.prompt_tokens != null
        ? usage.prompt_tokens - (cached ?? 0) - (cacheWrite ?? 0)
        : null,
    outputTokens: usage.completion_tokens ?? null,
    cacheCreationTokens: cacheWrite,
    cacheReadTokens: cached,
  }
}

const toParsedResponse = (
  model: string | undefined,
  usage: CompletionUsage | null | undefined,
  text: string | null,
  toolCalls: Array<{ id?: string; name?: string; args: string }>,
  stopReason: string | null,
): ParsedResponse => ({
  usage: normalizeUsage(model, usage),
  message: {
    content: text,
    tool_calls: toolCalls.filter((call) => call.id).map((call) => ({ id: call.id })),
  },
  toolUses: toolCalls
    .filter((call): call is { id: string; name: string; args: string } => !!call.id && !!call.name)
    .map((call) => ({ toolUseId: call.id, func: call.name, input: call.args || null })),
  text,
  stopReason,
})

// Streaming responses (`text/event-stream`): `chat.completion.chunk` events
// carry content/tool-call fragments in `choices[].delta` (tool calls keyed by
// their `index`, arguments accumulating across chunks). Usage arrives on a
// final choice-less chunk ONLY when the client sent
// `stream_options: {include_usage: true}` — the request is forwarded
// untouched, so a stream without it is still recorded, with null token
// counts (the chain/tool signals are real either way).
const parseSse = (text: string): ParsedResponse | null => {
  let model: string | undefined
  let usage: CompletionUsage | null | undefined
  let stopReason: string | null = null
  let contentText = ''
  const toolCalls: Array<{ id?: string; name?: string; args: string }> = []
  let seen = false

  for (const line of text.split('\n')) {
    if (!line.startsWith('data:')) continue
    const payload = line.slice(5).trim()
    if (!payload || payload === '[DONE]') continue

    let json: unknown
    try {
      json = JSON.parse(payload)
    } catch {
      continue
    }
    if (typeof json !== 'object' || json === null) continue

    const chunk = json as ChatCompletionChunk
    if (chunk.object !== 'chat.completion.chunk') continue
    seen = true
    if (chunk.model) model = chunk.model
    if (chunk.usage) usage = chunk.usage

    const choice = chunk.choices?.find((c) => c?.index === 0)
    if (!choice) continue
    if (choice.finish_reason) stopReason = choice.finish_reason
    if (typeof choice.delta?.content === 'string') contentText += choice.delta.content
    for (const fragment of choice.delta?.tool_calls ?? []) {
      const call = (toolCalls[fragment.index] ??= { args: '' })
      if (fragment.id) call.id = fragment.id
      if (fragment.function?.name) call.name = (call.name ?? '') + fragment.function.name
      if (fragment.function?.arguments) call.args += fragment.function.arguments
    }
  }

  if (!seen) return null
  return toParsedResponse(model, usage, contentText || null, toolCalls.filter(Boolean), stopReason)
}

// Non-streaming responses carry the full `usage` object on the JSON body.
const parseJson = (text: string): ParsedResponse | null => {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    return null
  }
  if (typeof json !== 'object' || json === null) return null

  const body = json as Partial<ChatCompletion>
  if (body.object !== 'chat.completion') return null

  const message = body.choices?.find((c) => c?.index === 0)?.message
  // Both `function` and `custom` (freeform) tool calls are captured: their
  // `call_...` ids must land in responseKey so the next turn's replayed history
  // — whose contentKey (session.ts) hashes ALL tool_call ids — chain-matches
  // back. Dropping custom calls here would desync the two keys and orphan the
  // turn. Streaming deltas only ever carry `function` (per the SDK types).
  const toolCalls = (message?.tool_calls ?? []).flatMap((call) =>
    call.type === 'function'
      ? [{ id: call.id, name: call.function.name, args: call.function.arguments ?? '' }]
      : call.type === 'custom'
        ? [{ id: call.id, name: call.custom.name, args: call.custom.input ?? '' }]
        : [],
  )
  return toParsedResponse(
    body.model,
    body.usage,
    message?.content ?? null,
    toolCalls,
    body.choices?.find((c) => c?.index === 0)?.finish_reason ?? null,
  )
}

// Drains the tapped copy of the response body (off the client's critical path,
// via ctx.waitUntil) and records usage. No-op when the body isn't a chat
// completion. `requestBody` is the tapped request body (null for non-chat
// routes) — only consulted after the response parses.
export const recordUsage = async (
  db: D1Database,
  requestBody: Promise<string | null>,
  responseBody: ReadableStream<Uint8Array>,
  contentType: string,
  meta: RequestMeta,
): Promise<void> => {
  const text = await new Response(responseBody).text()
  const parsed = contentType.includes('text/event-stream') ? parseSse(text) : parseJson(text)
  if (!parsed) return

  const [bodyText, responseKey] = await Promise.all([requestBody, contentKey(parsed.message)])
  const signals = await extractRequestSignals(bodyText)

  await persistUsage(
    db,
    {
      providerId: 'openai',
      usage: parsed.usage,
      responseKey,
      stopReason: parsed.stopReason,
      assistantText: parsed.text,
      toolUses: parsed.toolUses,
    },
    signals,
    meta,
  )
}
