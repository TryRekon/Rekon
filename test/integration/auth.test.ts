import { SELF, env } from 'cloudflare:test'
import { describe, it, expect } from 'vitest'
import { sign } from 'hono/jwt'

// The /_api surface is gated by requireUser: a valid SESSION_SECRET-signed JWT
// cookie is required. These tests exercise the middleware end-to-end — reject
// missing/garbage/expired tokens, accept a correctly signed one.

const mintCookie = async (payload: Record<string, unknown>) => {
  const token = await sign(payload, env.SESSION_SECRET)
  return `session=${token}`
}

describe('requireUser on /_api', () => {
  it('rejects a request with no cookie (401)', async () => {
    const res = await SELF.fetch('https://example.com/_api/me')
    expect(res.status).toBe(401)
  })

  it('rejects a garbage token (401)', async () => {
    const res = await SELF.fetch('https://example.com/_api/me', {
      headers: { cookie: 'session=not-a-jwt' },
    })
    expect(res.status).toBe(401)
  })

  it('rejects an expired token (401)', async () => {
    const cookie = await mintCookie({
      sub: 'auth-user-1',
      email: 'a@test.invalid',
      exp: Math.floor(Date.now() / 1000) - 60,
    })
    const res = await SELF.fetch('https://example.com/_api/me', { headers: { cookie } })
    expect(res.status).toBe(401)
  })

  it('accepts a valid token and resolves the user (not 401)', async () => {
    const userId = 'auth-user-ok'
    await env.DB.prepare(
      `INSERT INTO users (id, auth_provider, auth_subject, email, name, picture, created_at)
       VALUES (?, 'github', ?, ?, 'Auth Test', NULL, ?)`,
    )
      .bind(userId, `subject-${userId}`, `${userId}@test.invalid`, Date.now())
      .run()

    const cookie = await mintCookie({
      sub: userId,
      email: `${userId}@test.invalid`,
      exp: Math.floor(Date.now() / 1000) + 3600,
    })
    const res = await SELF.fetch('https://example.com/_api/me', { headers: { cookie } })
    expect(res.status).not.toBe(401)
    expect(res.status).toBe(200)
  })
})
