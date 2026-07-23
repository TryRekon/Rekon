import { SELF } from 'cloudflare:test'
import { describe, it, expect } from 'vitest'

// The proxy must never be an open relay: only a request under a KNOWN
// `/s/<system-uuid>` prefix may reach an upstream provider. Every other shape
// is rejected with a 404 *before* any upstream fetch happens, so a deployment
// can't be abused to proxy arbitrary traffic. These assertions never mock an
// upstream — a passing test proves the request was refused at the edge, because
// an accepted one would have tried (and, with no upstream, failed differently).

describe('open-relay closure', () => {
  it('serves the open health check', async () => {
    const res = await SELF.fetch('https://example.com/_health')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })

  it('rejects an unknown system id with 404 (no upstream call)', async () => {
    const res = await SELF.fetch('https://example.com/s/00000000-0000-0000-0000-000000000000/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'claude-opus-4-8', messages: [] }),
    })
    expect(res.status).toBe(404)
    const body = (await res.json()) as { error?: { type?: string } }
    expect(body.error?.type).toBe('not_found_error')
  })

  it('rejects the bare Anthropic path with no /s prefix', async () => {
    const res = await SELF.fetch('https://example.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'claude-opus-4-8', messages: [] }),
    })
    expect(res.status).toBe(404)
  })

  it('rejects the bare OpenAI path with no /s prefix', async () => {
    const res = await SELF.fetch('https://example.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-5.6', messages: [] }),
    })
    expect(res.status).toBe(404)
  })
})
