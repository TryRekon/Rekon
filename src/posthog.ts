// Lightweight PostHog product-analytics + error-tracking emission for adoption
// tracking (sign-ups, systems created, proxy usage volume) and server-side
// exception capture. Enabled only when POSTHOG_KEY is configured (mirrors the
// OAuth "both or disabled" pattern) — absent, every capture is a no-op. The
// project key is a public, write-only ingest key (the SPA ships the same value
// via VITE_POSTHOG_KEY); it's a `wrangler secret` to keep the phc_ string out
// of committed config, not because it's secret. Events ride the proxy's existing
// waitUntil drain, so they never touch the client's critical path.
//
// Analytics events carry no prompt/completion content, no tokens, no cost, and
// never the system UUID (that's the secret ingest key) — just who did what.
// Exception events carry the error type/message/stack plus caller-supplied
// context, but likewise never the system UUID or request bodies.

export type PostHogConfig = { key: string; host: string }

export type PostHogEvent = {
  event: string
  distinctId: string
  properties?: Record<string, unknown>
  timestamp?: string
}

export type CaptureExceptionOpts = {
  distinctId: string
  properties?: Record<string, unknown>
}

const DEFAULT_HOST = 'https://us.i.posthog.com'
const CAPTURE_TIMEOUT_MS = 3000
// Bound the free-form exception fields: an error message or stack can be
// arbitrarily large (a hostile upstream body surfaced into a message, a deep
// stack), and PostHog silently drops oversized events — exactly when the
// capture matters most.
const MAX_MESSAGE_CHARS = 1000
const MAX_FRAMES = 50

// Redact the secret system UUID from any free-form string before it leaves the
// Worker. An upstream/D1 error message or a stack frame can embed the
// `/s/<uuid>` proxy path, and that UUID doubles as the system's secret ingest
// key — sending it to a third party would leak a credential. Also caps length.
const scrubSensitive = (s: string): string =>
  s.replace(/\/s\/[0-9a-fA-F-]{36}/g, '/s/<redacted>').slice(0, MAX_MESSAGE_CHARS)

export const posthogConfig = (env: Env): PostHogConfig | null =>
  env.POSTHOG_KEY ? { key: env.POSTHOG_KEY, host: env.POSTHOG_HOST || DEFAULT_HOST } : null

// Best-effort POST to PostHog's event ingest. A PostHog outage or slow response
// must never break the caller, so the fetch self-catches and is bounded by an
// AbortController timeout. Shared by every capture helper below.
const postEvent = async (config: PostHogConfig, payload: Record<string, unknown>): Promise<void> => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), CAPTURE_TIMEOUT_MS)
  try {
    await fetch(`${config.host}/i/v0/e/`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ api_key: config.key, ...payload }),
      signal: controller.signal,
    })
  } catch {
    // best-effort — swallow network/timeout errors
  } finally {
    clearTimeout(timer)
  }
}

export const captureEvent = async (config: PostHogConfig, e: PostHogEvent): Promise<void> =>
  postEvent(config, {
    event: e.event,
    distinct_id: e.distinctId,
    properties: e.properties ?? {},
    timestamp: e.timestamp,
  })

// Parse a V8 error stack into PostHog "raw" stack frames (best-effort). Lines
// look like `    at fn (file:line:col)` or `    at file:line:col`; anything that
// doesn't match is skipped. V8 lists most-recent first, so reverse to the
// oldest-first order PostHog's error UI expects.
const parseStackFrames = (stack: string | undefined): Array<Record<string, unknown>> => {
  if (!stack) return []
  const frames: Array<Record<string, unknown>> = []
  for (const line of stack.split('\n')) {
    const m = line.match(/^\s*at\s+(?:(.+?)\s+\()?(.+?):(\d+):(\d+)\)?$/)
    if (!m) continue
    frames.push({
      platform: 'node:javascript',
      lang: 'javascript',
      function: m[1] ?? '<anonymous>',
      filename: m[2],
      lineno: Number(m[3]),
      colno: Number(m[4]),
      in_app: true,
      resolved: true,
    })
  }
  // Innermost (most-recent) frames are the most useful; cap from that end.
  return frames.reverse().slice(-MAX_FRAMES)
}

// Capture a caught exception as a PostHog `$exception` event so it lands in
// Error Tracking. PostHog auto-fingerprints from type/message/stack, so no
// fingerprint is sent. `mechanism.handled` is always true — the proxy catches
// every error it reports rather than letting the runtime surface it.
export const captureException = async (
  config: PostHogConfig,
  error: unknown,
  opts: CaptureExceptionOpts,
): Promise<void> => {
  const err = error instanceof Error ? error : new Error(String(error))
  return postEvent(config, {
    event: '$exception',
    distinct_id: opts.distinctId,
    // Caller properties are spread first so the reserved keys below always win
    // — a caller can add context but can never clobber distinct_id or the
    // exception payload. The nested distinct_id is required by PostHog's
    // $exception ingest for person association (in addition to the top-level).
    properties: {
      ...opts.properties,
      distinct_id: opts.distinctId,
      $exception_list: [
        {
          type: err.name,
          value: scrubSensitive(err.message),
          mechanism: { handled: true, synthetic: false },
          stacktrace: { type: 'raw', frames: parseStackFrames(err.stack) },
        },
      ],
    },
  })
}
