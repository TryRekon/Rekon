import { env } from 'cloudflare:test'
import { describe, it, expect, beforeEach } from 'vitest'
import { persistUsage } from '../../src/db/usage'
import type { RequestSignals } from '../../src/db/usage'

// End-to-end persistence pipeline against a REAL D1 (migrations applied), plus
// the multi-tenant fencing invariants. persistUsage is the shared sink every
// provider funnels into: system activation, session resolution (clientKey then
// chainKey), the requests insert, and tool-call recording. Both session signals
// are client-supplied, so the security-critical property is that a signal
// replayed by tenant B must NEVER resolve into tenant A's session.

const now = () => Date.now()

async function seedUserAndSystem(userId: string, systemId: string): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO users (id, auth_provider, auth_subject, email, name, picture, created_at)
     VALUES (?, 'github', ?, ?, 'Test', NULL, ?)`,
  )
    .bind(userId, `subject-${userId}`, `${userId}@test.invalid`, now())
    .run()
  await env.DB.prepare(
    `INSERT INTO systems (id, user_id, name, created_at, first_event_at) VALUES (?, ?, ?, ?, NULL)`,
  )
    .bind(systemId, userId, `sys-${systemId}`, now())
    .run()
}

const baseRecord = (responseKey: string, model = 'claude-opus-4-8') => ({
  providerId: 'anthropic',
  usage: {
    model,
    inputTokens: 100,
    outputTokens: 50,
    cacheCreationTokens: null,
    cacheReadTokens: null,
  },
  responseKey,
  stopReason: 'end_turn',
  assistantText: 'assistant reply',
  toolUses: [],
})

const signals = (over: Partial<RequestSignals> = {}): RequestSignals => ({
  clientKey: null,
  chainKey: null,
  toolResults: [],
  userText: 'hello',
  toolset: null,
  ...over,
})

const meta = (systemId: string, userId: string, firstEventAt: Date | null) => ({
  path: '/v1/messages',
  method: 'POST',
  status: 200,
  streaming: false,
  requestId: null,
  system: { id: systemId, userId, firstEventAt },
})

// Fresh tenants per test — the applied schema persists across the file, so use
// unique ids rather than truncating tables.
let A: { user: string; sys: string }
let B: { user: string; sys: string }
let n = 0
beforeEach(async () => {
  n += 1
  A = { user: `userA${n}`, sys: `sysA${n}` }
  B = { user: `userB${n}`, sys: `sysB${n}` }
  await seedUserAndSystem(A.user, A.sys)
  await seedUserAndSystem(B.user, B.sys)
})

describe('record pipeline', () => {
  it('activates a pending system and inserts a session + request', async () => {
    await persistUsage(env.DB, baseRecord('RESP1'), signals({ clientKey: 'CONV1' }), meta(A.sys, A.user, null))

    const system = await env.DB.prepare('SELECT first_event_at FROM systems WHERE id = ?').bind(A.sys).first<{
      first_event_at: number | null
    }>()
    expect(system?.first_event_at).not.toBeNull()

    const session = await env.DB.prepare('SELECT id, client_key, source FROM sessions WHERE system_id = ?')
      .bind(A.sys)
      .first<{ id: string; client_key: string; source: string }>()
    expect(session?.client_key).toBe('CONV1')
    expect(session?.source).toBe('metadata')

    const req = await env.DB.prepare(
      'SELECT COUNT(*) as c FROM requests WHERE session_id = ?',
    )
      .bind(session!.id)
      .first<{ c: number }>()
    expect(req?.c).toBe(1)
  })
})

describe('tenant fencing', () => {
  it('the SAME clientKey under two systems yields two disjoint sessions', async () => {
    await persistUsage(env.DB, baseRecord('R_A'), signals({ clientKey: 'SHARED_KEY' }), meta(A.sys, A.user, null))
    await persistUsage(env.DB, baseRecord('R_B'), signals({ clientKey: 'SHARED_KEY' }), meta(B.sys, B.user, null))

    const rows = await env.DB.prepare('SELECT id, system_id FROM sessions WHERE client_key = ? ORDER BY system_id')
      .bind('SHARED_KEY')
      .all<{ id: string; system_id: string }>()
    const forThisPair = rows.results.filter((r) => r.system_id === A.sys || r.system_id === B.sys)
    expect(forThisPair).toHaveLength(2)
    expect(forThisPair[0]!.system_id).not.toBe(forThisPair[1]!.system_id)
    expect(forThisPair[0]!.id).not.toBe(forThisPair[1]!.id)
  })

  it("tenant B replaying tenant A's chainKey does NOT attach to A's session", async () => {
    // A records a response whose replay key is CHAIN_A.
    await persistUsage(env.DB, baseRecord('CHAIN_A'), signals({ clientKey: 'A_CONV' }), meta(A.sys, A.user, null))
    const aSession = await env.DB.prepare('SELECT id FROM sessions WHERE system_id = ?')
      .bind(A.sys)
      .first<{ id: string }>()

    // B sends a request whose chainKey equals A's response key, no clientKey.
    await persistUsage(env.DB, baseRecord('B_RESP'), signals({ chainKey: 'CHAIN_A' }), meta(B.sys, B.user, null))

    // B must have started its OWN fresh session under its own system.
    const bSessions = await env.DB.prepare('SELECT id, system_id, source FROM sessions WHERE system_id = ?')
      .bind(B.sys)
      .all<{ id: string; system_id: string; source: string }>()
    expect(bSessions.results).toHaveLength(1)
    expect(bSessions.results[0]!.id).not.toBe(aSession?.id)
    expect(bSessions.results[0]!.source).toBe('chain')

    // And A's request was never reparented to anything in B.
    const crossed = await env.DB.prepare(
      `SELECT COUNT(*) as c FROM requests r
       JOIN sessions s ON r.session_id = s.id
       WHERE s.system_id = ? AND r.response_key = 'CHAIN_A'`,
    )
      .bind(B.sys)
      .first<{ c: number }>()
    expect(crossed?.c).toBe(0)
  })
})
