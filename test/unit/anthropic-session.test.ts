import { describe, it, expect } from 'vitest'
import { extractRequestSignals, extractSessionTitle } from '../../src/routes/anthropic/session'

describe('extractRequestSignals — clientKey (Claude Code metadata.user_id)', () => {
  const withUserId = (userId: string) =>
    JSON.stringify({ messages: [{ role: 'user', content: 'hi' }], metadata: { user_id: userId } })

  it('reads session_id from the current JSON-encoded format', async () => {
    const s = await extractRequestSignals(withUserId(JSON.stringify({ session_id: 'sess-123' })))
    expect(s.clientKey).toBe('sess-123')
  })

  it('reads the legacy underscore-delimited session_<uuid> format', async () => {
    const legacy = 'user_deadbeef_account_11111111_session_abcdef0123456789'
    const s = await extractRequestSignals(withUserId(legacy))
    expect(s.clientKey).toBe('abcdef0123456789')
  })

  it('does NOT derive a key from a user id with no session component', async () => {
    // A per-user key would merge every conversation by that user — must be null.
    const s = await extractRequestSignals(withUserId('user_deadbeef_account_22222222'))
    expect(s.clientKey).toBeNull()
  })

  it('returns all-null signals for a non-JSON body', async () => {
    const s = await extractRequestSignals('not json at all')
    expect(s).toEqual({ clientKey: null, chainKey: null, toolResults: [], userText: null, toolset: null })
  })
})

describe('extractRequestSignals — post-assistant window', () => {
  it('captures only NEW tool results and user text after the last assistant turn', async () => {
    const body = JSON.stringify({
      messages: [
        { role: 'user', content: 'old' },
        { role: 'assistant', content: [{ type: 'text', text: 'reply' }] },
        {
          role: 'user',
          content: [
            { type: 'tool_result', tool_use_id: 'toolu_1', content: 'RESULT' },
            { type: 'text', text: 'and here is my next message' },
          ],
        },
      ],
    })
    const s = await extractRequestSignals(body)
    expect(s.toolResults).toHaveLength(1)
    expect(s.toolResults[0]).toMatchObject({ toolUseId: 'toolu_1', output: 'RESULT', isError: false })
    expect(s.userText).toBe('and here is my next message')
  })

  it('turn 1 (no assistant yet) treats the whole prompt as new user text', async () => {
    const s = await extractRequestSignals(
      JSON.stringify({ messages: [{ role: 'user', content: 'first message' }] }),
    )
    expect(s.userText).toBe('first message')
    expect(s.chainKey).toBeNull()
  })

  it('flags an errored tool result', async () => {
    const body = JSON.stringify({
      messages: [
        { role: 'assistant', content: [{ type: 'text', text: 'x' }] },
        { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_e', content: 'boom', is_error: true }] },
      ],
    })
    const s = await extractRequestSignals(body)
    expect(s.toolResults[0]).toMatchObject({ toolUseId: 'toolu_e', isError: true })
  })
})

describe('extractSessionTitle — strict title-generation detection', () => {
  it('accepts {"title": "..."} (CLI) and {"name": "..."} (SDK)', () => {
    expect(extractSessionTitle('{"title": "Fix the auth bug"}', 12)).toBe('Fix the auth bug')
    expect(extractSessionTitle('{"name": "Onboarding flow"}', 8)).toBe('Onboarding flow')
  })

  it('rejects output over the token ceiling (not a title turn)', () => {
    expect(extractSessionTitle('{"title": "x"}', 61)).toBeNull()
  })

  it('rejects objects with more than one key', () => {
    expect(extractSessionTitle('{"title": "x", "extra": 1}', 10)).toBeNull()
  })

  it('rejects a normal turn that merely mentions the word title', () => {
    expect(extractSessionTitle('The title of the book is Dune.', 10)).toBeNull()
  })

  it('rejects non-JSON, empty, and non-string values', () => {
    expect(extractSessionTitle('not json', 10)).toBeNull()
    expect(extractSessionTitle(null, 10)).toBeNull()
    expect(extractSessionTitle('{"title": 42}', 10)).toBeNull()
    expect(extractSessionTitle('{"title": "   "}', 10)).toBeNull()
  })
})
