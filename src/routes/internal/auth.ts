import { Hono } from 'hono'
import type { Context } from 'hono'
import { googleAuth } from '@hono/oauth-providers/google'
import { githubAuth } from '@hono/oauth-providers/github'
import { drizzle } from 'drizzle-orm/d1'
import { and, eq } from 'drizzle-orm'
import { users } from '../../db/schema'
import { clearSessionCookie, setSessionCookie } from '../../auth/session'
import { captureEvent, posthogConfig } from '../../posthog'

// OAuth sign-in. Each provider route is both the entry point and the redirect
// URI: the middleware redirects to the provider when no `code` query param is
// present, and on the callback it verifies the state cookie, exchanges the
// code, and populates c.get('user-<provider>') before next(). Providers are
// enabled by configuring their client id — unconfigured ones 404, and
// GET /_auth/providers tells the login page which buttons to render.

type AuthProvider = 'google' | 'github'

type OAuthProfile = {
  provider: AuthProvider
  subject: string
  // Must be verified by the provider — it feeds the ALLOWED_EMAILS check.
  email: string
  name: string | null
  picture: string | null
}

const allowedEmails = (env: Env): Set<string> | null => {
  const raw = env.ALLOWED_EMAILS?.trim()
  if (!raw) return null
  const emails = raw
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean)
  return emails.length ? new Set(emails) : null
}

const completeSignIn = async (
  c: Context<{ Bindings: Env }>,
  profile: OAuthProfile,
): Promise<Response> => {
  const allowlist = allowedEmails(c.env)
  if (allowlist && !allowlist.has(profile.email.toLowerCase())) {
    return c.text(`${profile.email} is not allowed to sign in to this instance.`, 403)
  }

  const db = drizzle(c.env.DB)
  const identity = and(
    eq(users.authProvider, profile.provider),
    eq(users.authSubject, profile.subject),
  )
  // Existence pre-check distinguishes a first-ever sign-up from a returning
  // sign-in for the adoption event below; the row id itself comes from the
  // authoritative post-upsert select (race-safe vs the generated uuid).
  const existing = await db.select({ id: users.id }).from(users).where(identity).get()

  // Upsert-then-select keyed on the provider's stable subject id — profile
  // fields refresh on every sign-in, the row id never changes.
  await db
    .insert(users)
    .values({
      id: crypto.randomUUID(),
      authProvider: profile.provider,
      authSubject: profile.subject,
      email: profile.email,
      name: profile.name,
      picture: profile.picture,
      createdAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [users.authProvider, users.authSubject],
      set: { email: profile.email, name: profile.name, picture: profile.picture },
    })
  const user = await db.select({ id: users.id }).from(users).where(identity).get()

  await setSessionCookie(c, { id: user!.id, email: profile.email })

  const posthog = posthogConfig(c.env)
  if (!existing && posthog) {
    c.executionCtx.waitUntil(
      captureEvent(posthog, {
        event: 'user_signed_up',
        distinctId: user!.id,
        properties: { auth_provider: profile.provider },
      }),
    )
  }

  return c.redirect('/')
}

// The middleware's own email pick ignores GitHub's `verified` flag, so
// re-read /user/emails and only accept a verified address (primary first).
type GitHubEmail = { email?: string; primary?: boolean; verified?: boolean }

const fetchVerifiedGitHubEmail = async (accessToken: string): Promise<string | null> => {
  const res = await fetch('https://api.github.com/user/emails', {
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: 'application/json',
      'user-agent': 'token-profiler',
    },
  })
  if (!res.ok) return null
  const emails = (await res.json()) as GitHubEmail[]
  if (!Array.isArray(emails)) return null
  const verified = emails.filter((e) => e?.verified === true && typeof e.email === 'string')
  return (verified.find((e) => e.primary) ?? verified[0])?.email ?? null
}

const notConfigured = (c: Context, provider: string): Response =>
  c.text(`${provider} sign-in is not configured on this instance.`, 404)

export const auth = new Hono<{ Bindings: Env }>()
  // A provider is usable only with both halves of its credentials — the id
  // alone can start the redirect but the code exchange would 400.
  .get('/providers', (c) =>
    c.json({
      google: Boolean(c.env.GOOGLE_CLIENT_ID && c.env.GOOGLE_CLIENT_SECRET),
      github: Boolean(c.env.GITHUB_CLIENT_ID && c.env.GITHUB_CLIENT_SECRET),
    }),
  )
  .use('/google', async (c, next) => {
    if (!c.env.GOOGLE_CLIENT_ID || !c.env.GOOGLE_CLIENT_SECRET) return notConfigured(c, 'Google')
    return googleAuth({
      client_id: c.env.GOOGLE_CLIENT_ID,
      client_secret: c.env.GOOGLE_CLIENT_SECRET,
      scope: ['openid', 'email', 'profile'],
    })(c, next)
  })
  .get('/google', async (c) => {
    const profile = c.get('user-google')
    // verified_email gates the allowlist: an unverified address could be
    // claimed by someone who doesn't control it.
    if (!profile?.id || !profile.email || profile.verified_email !== true) {
      return c.text('Google sign-in did not return a verified account.', 403)
    }
    return completeSignIn(c, {
      provider: 'google',
      subject: profile.id,
      email: profile.email,
      name: profile.name ?? null,
      picture: profile.picture ?? null,
    })
  })
  .use('/github', async (c, next) => {
    if (!c.env.GITHUB_CLIENT_ID || !c.env.GITHUB_CLIENT_SECRET) return notConfigured(c, 'GitHub')
    return githubAuth({
      client_id: c.env.GITHUB_CLIENT_ID,
      client_secret: c.env.GITHUB_CLIENT_SECRET,
      // OAuth App (not GitHub App): scopes go in the authorize URL and the
      // callback URL comes from the app's settings.
      oauthApp: true,
      scope: ['read:user', 'user:email'],
    })(c, next)
  })
  .get('/github', async (c) => {
    const profile = c.get('user-github')
    const accessToken = c.get('token')?.token
    if (!profile?.id || !accessToken) {
      return c.text('GitHub sign-in did not return an account.', 403)
    }
    const email = await fetchVerifiedGitHubEmail(accessToken)
    if (!email) {
      return c.text('GitHub sign-in requires a verified email address.', 403)
    }
    return completeSignIn(c, {
      provider: 'github',
      subject: String(profile.id),
      email,
      name: profile.name ?? profile.login ?? null,
      picture: profile.avatar_url ?? null,
    })
  })
  .post('/logout', (c) => {
    clearSessionCookie(c)
    return c.json({ ok: true })
  })
