import { describe, it, expect } from 'vitest'
import {
  contentKey as anthropicContentKey,
  extractRequestSignals as anthropicSignals,
} from '../../src/routes/anthropic/session'
import {
  contentKey as openaiContentKey,
  extractRequestSignals as openaiSignals,
} from '../../src/routes/openai/session'

// The single invariant the entire session graph rests on: the hash the proxy
// records for a response (responseKey, via contentKey on the parsed response)
// must equal the chainKey it later computes from the client's verbatim replay
// of that same assistant turn in the next request. If these two code paths ever
// diverge, every multi-turn conversation shatters into orphaned single-turn
// sessions. These tests pin both sides against each other for both providers.

describe('Anthropic response↔replay chain invariant', () => {
  it('responseKey(parsed response) === chainKey(next request replay)', async () => {
    // Response side: parsed assistant content blocks (see anthropic/usage.ts).
    const responseContent = [
      { type: 'text', text: 'Here is the answer.' },
      { type: 'tool_use', id: 'toolu_abc123', name: 'get_weather', input: { city: 'SF' } },
    ]
    const responseKey = await anthropicContentKey(responseContent)
    expect(responseKey).not.toBeNull()

    // Request side: the client replays that assistant turn verbatim, then adds
    // the tool result / next user turn.
    const nextRequest = JSON.stringify({
      model: 'claude-opus-4-8',
      messages: [
        { role: 'user', content: 'What is the weather?' },
        { role: 'assistant', content: responseContent },
        {
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: 'toolu_abc123', content: 'Sunny' }],
        },
      ],
    })
    const signals = await anthropicSignals(nextRequest)
    expect(signals.chainKey).toBe(responseKey)
  })

  it('excludes thinking blocks — a replay that drops/keeps them still matches', async () => {
    const canonical = [{ type: 'text', text: 'hi' }]
    const withThinking = [
      { type: 'thinking', thinking: 'internal reasoning the client may rewrite' },
      { type: 'text', text: 'hi' },
    ]
    expect(await anthropicContentKey(withThinking)).toBe(await anthropicContentKey(canonical))
  })

  it('tool_use id participates — a different id yields a different key', async () => {
    const a = [{ type: 'tool_use', id: 'toolu_1', name: 'x' }]
    const b = [{ type: 'tool_use', id: 'toolu_2', name: 'x' }]
    expect(await anthropicContentKey(a)).not.toBe(await anthropicContentKey(b))
  })
})

describe('OpenAI response↔replay chain invariant', () => {
  it('responseKey(parsed response) === chainKey(next request replay)', async () => {
    // Response side: choices[0].message shape.
    const responseMessage = {
      content: 'Let me check that.',
      tool_calls: [{ id: 'call_xyz789', type: 'function', function: { name: 'lookup' } }],
    }
    const responseKey = await openaiContentKey(responseMessage)
    expect(responseKey).not.toBeNull()

    // Request side: replayed assistant message (role added, same content+ids).
    const nextRequest = JSON.stringify({
      model: 'gpt-5.6',
      messages: [
        { role: 'user', content: 'look it up' },
        { role: 'assistant', ...responseMessage },
        { role: 'tool', tool_call_id: 'call_xyz789', content: 'result' },
      ],
    })
    const signals = await openaiSignals(nextRequest)
    expect(signals.chainKey).toBe(responseKey)
  })

  it('string content and single-text-part array hash identically', async () => {
    const asString = { content: 'hello' }
    const asParts = { content: [{ type: 'text', text: 'hello' }] }
    expect(await openaiContentKey(asString)).toBe(await openaiContentKey(asParts))
  })
})

describe('cross-provider isolation', () => {
  it('identical text produces provider-independent keys (both hash t:<text>)', async () => {
    // Both providers use the same `t:`/`u:` canonicalization, so plain text with
    // no tool ids hashes the same. This documents the shared contract; if a
    // provider changes its canonical form, this test flags the divergence.
    const a = await anthropicContentKey([{ type: 'text', text: 'same' }])
    const o = await openaiContentKey({ content: 'same' })
    expect(a).toBe(o)
  })
})
