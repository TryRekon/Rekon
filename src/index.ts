import { Hono } from 'hono'
import { health } from './routes/internal/health'
import { auth } from './routes/internal/auth'
import { api } from './routes/internal/api'
import { publicRoutes } from './routes/internal/public'
import { anthropic } from './routes/anthropic'
import { openai } from './routes/openai'
import { captureException, posthogConfig } from './posthog'

const app = new Hono<{ Bindings: Env }>()

// Last-resort handler for anything a route throws instead of returning a
// Response. Reports the exception to PostHog Error Tracking (best-effort, off
// the response path) and returns an opaque 500 — handled 4xx/404 rejections are
// returned Responses, so they never reach here. Attributed to the request's
// user/system owner when one is on context, else an anonymous "server" bucket.
app.onError((err, c) => {
  // Always leave a local trace — Workers tail logs catch this even when PostHog
  // is disabled (no key), so a failure is never fully silent.
  console.error('unhandled error', err)
  // The capture is best-effort and must never override the 500 it accompanies:
  // guard the whole block so a throw here (e.g. executionCtx unavailable, a
  // malformed URL) can't turn error handling into a second failure.
  try {
    const posthog = posthogConfig(c.env)
    if (posthog) {
      // Base-app context has no typed Variables; the auth and system-scope
      // middlewares set these on the routes that reach here.
      const { user, system } = c.var as {
        user?: { id: string }
        system?: { userId: string }
      }
      c.executionCtx.waitUntil(
        captureException(posthog, err, {
          distinctId: user?.id ?? system?.userId ?? 'server',
          properties: {
            $process_person_profile: false,
            source: 'onError',
            method: c.req.method,
            // Strip the /s/<uuid> prefix — the UUID is the system's secret
            // ingest key and must never be sent to a third party.
            path: new URL(c.req.url).pathname.replace(/^\/s\/[^/]+/, '/s/<redacted>'),
          },
        }),
      )
    }
  } catch {
    // capture failure must not break the error response
  }
  return c.json({ error: 'internal_error' }, 500)
})

// Internal routes live under `/_` so they never collide with Anthropic's
// `/v1/*` surface, which is proxied by the catch-all below. `/_health` and
// `/_public` are open (the latter is the pre-signup draft on-ramp); `/_api`
// requires a signed-in user, and the proxy requires a valid system id in the
// path. All are pinned to the Worker by the `/_*` run_worker_first rule.
app.route('/_health', health)
app.route('/_public', publicRoutes)
app.route('/_auth', auth)
app.route('/_api', api)
// Order matters: the openai router's `/openai/*` and `/s/:system/openai/*`
// routes must land before the anthropic catch-alls (`*`, `/s/:system/*`),
// which match those paths too.
app.route('/', openai)
app.route('/', anthropic)

export default app
