import { describe, it, expect } from 'vitest'
import { extractRequestSignals } from '../../src/routes/openai/session'

describe('extractRequestSignals (OpenAI) — clientKey', () => {
  it('honors metadata.session_id', async () => {
    const s = await extractRequestSignals(
      JSON.stringify({ messages: [{ role: 'user', content: 'hi' }], metadata: { session_id: 'S1' } }),
    )
    expect(s.clientKey).toBe('S1')
  })

  it('falls back to metadata.conversation_id', async () => {
    const s = await extractRequestSignals(
      JSON.stringify({ messages: [], metadata: { conversation_id: 'C9' } }),
    )
    expect(s.clientKey).toBe('C9')
  })

  it('ignores per-user fields (user, prompt_cache_key) — they would merge conversations', async () => {
    const s = await extractRequestSignals(
      JSON.stringify({ messages: [], user: 'u-42', prompt_cache_key: 'pck', metadata: {} }),
    )
    expect(s.clientKey).toBeNull()
  })
})

describe('extractRequestSignals (OpenAI) — post-assistant window', () => {
  it('captures role:tool results and user text after the last assistant turn', async () => {
    const body = JSON.stringify({
      messages: [
        { role: 'user', content: 'old' },
        { role: 'assistant', content: 'reply', tool_calls: [{ id: 'call_1' }] },
        { role: 'tool', tool_call_id: 'call_1', content: 'TOOL OUTPUT' },
        { role: 'user', content: 'next turn' },
      ],
    })
    const s = await extractRequestSignals(body)
    expect(s.toolResults).toHaveLength(1)
    expect(s.toolResults[0]).toMatchObject({ toolUseId: 'call_1', output: 'TOOL OUTPUT', isError: false })
    expect(s.userText).toBe('next turn')
  })

  it('returns all-null signals for a malformed body', async () => {
    expect(await extractRequestSignals('{oops')).toEqual({
      clientKey: null,
      chainKey: null,
      toolResults: [],
      userText: null,
      toolset: null,
    })
  })
})

describe('extractRequestSignals (OpenAI) — toolset', () => {
  it('extracts function tool definitions, skipping nameless entries', async () => {
    const body = JSON.stringify({
      messages: [],
      tools: [
        { type: 'function', function: { name: 'search', description: 'find things', parameters: { type: 'object' } } },
        { type: 'function', function: { description: 'no name' } },
      ],
    })
    const s = await extractRequestSignals(body)
    expect(s.toolset?.defs).toHaveLength(1)
    expect(s.toolset?.defs[0]).toMatchObject({ name: 'search', description: 'find things' })
    expect(s.toolset?.toolsetHash).toMatch(/^[0-9a-f]{64}$/)
  })
})
