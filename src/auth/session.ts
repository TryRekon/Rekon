import type { Context, MiddlewareHandler } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { sign, verify } from 'hono/jwt'
import type { JWTPayload } from 'hono/utils/jwt/types'

// Stateless auth sessions: the cookie is a SESSION_SECRET-signed JWT carrying
// {sub: userId, email}. No session table — revocation is rotating the secret.

export type SessionUser = { id: string; email: string }

export type AuthEnv = { Bindings: Env; Variables: { user: SessionUser } }

const COOKIE = 'session'
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60

export const setSessionCookie = async (
  c: Context<{ Bindings: Env }>,
  user: SessionUser,
): Promise<void> => {
  const token = await sign(
    { sub: user.id, email: user.email, exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS },
    c.env.SESSION_SECRET,
  )
  setCookie(c, COOKIE, token, {
    httpOnly: true,
    // Plain-http localhost dev still needs the cookie to stick.
    secure: new URL(c.req.url).protocol === 'https:',
    sameSite: 'Lax',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  })
}

export const clearSessionCookie = (c: Context<{ Bindings: Env }>): void => {
  deleteCookie(c, COOKIE, { path: '/' })
}

export const requireUser: MiddlewareHandler<AuthEnv> = async (c, next) => {
  const token = getCookie(c, COOKIE)
  if (!token) return c.json({ error: 'unauthorized' }, 401)

  let payload: JWTPayload
  try {
    payload = await verify(token, c.env.SESSION_SECRET, 'HS256')
  } catch {
    return c.json({ error: 'unauthorized' }, 401)
  }
  if (typeof payload.sub !== 'string' || typeof payload.email !== 'string') {
    return c.json({ error: 'unauthorized' }, 401)
  }

  c.set('user', { id: payload.sub, email: payload.email })
  await next()
}
