import type { Message, RawMessageStreamEvent } from '@anthropic-ai/sdk/resources/messages'
import {
  persistUsage,
  type NormalizedUsage,
  type ParsedToolUse,
  type RequestMeta,
} from '../../db/usage'
import { contentKey, extractRequestSignals, extractSessionTitle } from './session'

// Parse targets are the SDK's own wire types, so field renames/additions
// surface at typecheck when bumping @anthropic-ai/sdk (type-only imports —
// nothing from the SDK ends up in the bundle). Values are only recorded,
// never branched on, so optional chaining is the only runtime guard needed.

// `content` mirrors the response's assistant content blocks in the minimal
// shape contentKey() consumes, so the next turn's replayed history can be
// chain-matched back to this response. `toolUses` carries the tool_use blocks
// with their serialized input for the tool_calls table.
type ParsedResponse = {
  usage: NormalizedUsage
  content: unknown
  toolUses: ParsedToolUse[]
  text: string | null
  stopReason: string | null
}

const joinTextBlocks = (blocks: Array<{ type?: string; text?: string }>): string | null => {
  const texts = blocks.filter((b) => b?.type === 'text' && b.text).map((b) => b.text!)
  return texts.length ? texts.join('\n\n') : null
}

type SseBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; inputJson: string }

// Streaming responses (`text/event-stream`): input + cache tokens land in the
// `message_start` event; `message_delta` finalizes output tokens and, on long
// turns, can also revise input/cache counts — the last non-null value wins,
// mirroring the SDK's own MessageStream accumulation. Content blocks are
// rebuilt from `content_block_start`/`content_block_delta` for the chain key
// and tool_use capture (tool input streams as `input_json_delta` fragments).
const parseSse = (text: string): ParsedResponse | null => {
  const usage: NormalizedUsage = {}
  const blocks: SseBlock[] = []
  let stopReason: string | null = null
  let seen = false

  for (const line of text.split('\n')) {
    if (!line.startsWith('data:')) continue
    const payload = line.slice(5).trim()
    if (!payload) continue

    let json: unknown
    try {
      json = JSON.parse(payload)
    } catch {
      continue
    }
    if (typeof json !== 'object' || json === null) continue

    const evt = json as RawMessageStreamEvent
    switch (evt.type) {
      case 'message_start': {
        seen = true
        usage.model = evt.message.model
        usage.inputTokens = evt.message.usage?.input_tokens
        usage.outputTokens = evt.message.usage?.output_tokens
        usage.cacheCreationTokens = evt.message.usage?.cache_creation_input_tokens
        usage.cacheReadTokens = evt.message.usage?.cache_read_input_tokens
        break
      }
      case 'content_block_start': {
        const block = evt.content_block
        if (block.type === 'text') {
          blocks[evt.index] = { type: 'text', text: block.text }
        } else if (block.type === 'tool_use') {
          blocks[evt.index] = { type: 'tool_use', id: block.id, name: block.name, inputJson: '' }
        }
        break
      }
      case 'content_block_delta': {
        const block = blocks[evt.index]
        if (evt.delta.type === 'text_delta' && block?.type === 'text') {
          block.text += evt.delta.text
        } else if (evt.delta.type === 'input_json_delta' && block?.type === 'tool_use') {
          block.inputJson += evt.delta.partial_json
        }
        break
      }
      case 'message_delta': {
        if (evt.delta?.stop_reason) stopReason = evt.delta.stop_reason
        const delta = evt.usage
        if (delta?.output_tokens != null) {
          seen = true
          usage.outputTokens = delta.output_tokens
        }
        if (delta?.input_tokens != null) {
          seen = true
          usage.inputTokens = delta.input_tokens
        }
        if (delta?.cache_creation_input_tokens != null) {
          seen = true
          usage.cacheCreationTokens = delta.cache_creation_input_tokens
        }
        if (delta?.cache_read_input_tokens != null) {
          seen = true
          usage.cacheReadTokens = delta.cache_read_input_tokens
        }
        break
      }
    }
  }

  if (!seen) return null
  const content = blocks.filter(Boolean)
  const toolUses = content
    .filter((block): block is Extract<SseBlock, { type: 'tool_use' }> => block.type === 'tool_use')
    .map((block) => ({ toolUseId: block.id, func: block.name, input: block.inputJson || null }))
  return { usage, content, toolUses, text: joinTextBlocks(content), stopReason }
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

  const body = json as Partial<Message>
  if (body.type !== 'message' || !body.usage) return null

  const content = Array.isArray(body.content) ? body.content : []
  const toolUses = content
    .filter((block) => block.type === 'tool_use')
    .map((block) => ({
      toolUseId: block.id,
      func: block.name,
      input: block.input == null ? null : JSON.stringify(block.input),
    }))

  return {
    usage: {
      model: body.model,
      inputTokens: body.usage.input_tokens,
      outputTokens: body.usage.output_tokens,
      cacheCreationTokens: body.usage.cache_creation_input_tokens,
      cacheReadTokens: body.usage.cache_read_input_tokens,
    },
    content,
    toolUses,
    text: joinTextBlocks(content),
    stopReason: body.stop_reason ?? null,
  }
}

// Drains the tapped copy of the response body (off the client's critical path,
// via ctx.waitUntil) and records usage. No-op when the body carries no usage.
// `requestBody` is the tapped request body (null for non-message routes) —
// only consulted after usage parses, so count_tokens etc. cost nothing extra.
export const recordUsage = async (
  db: D1Database,
  requestBody: Promise<string | null>,
  responseBody: ReadableStream<Uint8Array>,
  contentType: string,
  meta: RequestMeta,
): Promise<void> => {
  const text = await new Response(responseBody).text()
  const parsed = contentType.includes('text/event-stream')
    ? parseSse(text)
    : parseJson(text)
  if (!parsed) return

  const [bodyText, responseKey] = await Promise.all([requestBody, contentKey(parsed.content)])
  const signals = await extractRequestSignals(bodyText)

  await persistUsage(
    db,
    {
      providerId: 'anthropic',
      usage: parsed.usage,
      responseKey,
      stopReason: parsed.stopReason,
      assistantText: parsed.text,
      sessionName: extractSessionTitle(parsed.text, parsed.usage.outputTokens ?? null),
      toolUses: parsed.toolUses,
    },
    signals,
    meta,
  )
}
