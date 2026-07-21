import { useCallback, useEffect, useRef, useState } from 'react'
import type { SystemStatus } from '../../shared/api-types'
import {
  createDraftSystem,
  fetchAuthProviders,
  fetchSystemStatus,
  runDemo,
  type AuthProviders,
} from '../lib/api'
import { captureEvent } from '../lib/analytics'
import { useRouter } from '../lib/router'
import { clearDraftId, readDraftId, writeDraftId } from '../lib/draft'
import { BrandMark } from '../components/sidebar'
import { SignInButtons } from '../components/sign-in-buttons'
import { SetupInstructions } from '../components/setup-instructions'
import { Button } from '../components/ui/button'
import { Card, CardContent } from '../components/ui/card'

const POLL_MS = 5000

// [input, output, cacheRead, cacheWrite] as % of the chart height, in the
// cache-read-heavy shape agentic traffic actually has.
const MOCK_DAYS: [number, number, number, number][] = [
  [2, 5, 22, 6],
  [2, 6, 30, 8],
  [3, 6, 26, 7],
  [3, 8, 38, 10],
  [3, 9, 43, 11],
  [2, 7, 34, 9],
  [1, 4, 20, 5],
  [3, 8, 40, 11],
  [4, 10, 51, 13],
  [3, 9, 47, 12],
  [4, 11, 57, 15],
  [4, 12, 63, 16],
]

const MOCK_STATS = [
  { label: 'Tokens', value: '48.2M' },
  { label: 'Est. cost', value: '$61.48' },
  { label: 'Sessions', value: '312' },
] as const

const LEGEND = [
  { label: 'Input', className: 'bg-chart-input' },
  { label: 'Output', className: 'bg-chart-output' },
  { label: 'Cache read', className: 'bg-chart-cache-read' },
  { label: 'Cache write', className: 'bg-chart-cache-write' },
] as const

const DashboardMock = () => (
  <div aria-hidden="true" className="rounded-xl border bg-card p-5 shadow-sm">
    <div className="flex items-baseline justify-between">
      <p className="text-sm font-medium">Overview</p>
      <p className="text-[11px] text-muted-foreground">Last 12 days</p>
    </div>

    <div className="mt-4 grid grid-cols-3 gap-3">
      {MOCK_STATS.map((stat) => (
        <div key={stat.label} className="rounded-lg border bg-background px-3 py-2.5">
          <p className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
            {stat.label}
          </p>
          <p className="mt-0.5 text-lg font-semibold tabular-nums tracking-tight">{stat.value}</p>
        </div>
      ))}
    </div>

    <div className="mt-5 flex h-40 items-end gap-1.5">
      {MOCK_DAYS.map(([input, output, cacheRead, cacheWrite], i) => (
        <div key={i} className="flex h-full flex-1 flex-col justify-end gap-px">
          <div className="rounded-t-[3px] bg-chart-cache-write" style={{ height: `${cacheWrite}%` }} />
          <div className="bg-chart-cache-read" style={{ height: `${cacheRead}%` }} />
          <div className="bg-chart-output" style={{ height: `${output}%` }} />
          <div className="bg-chart-input" style={{ height: `${input}%` }} />
        </div>
      ))}
    </div>

    <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 border-t pt-3">
      {LEGEND.map((item) => (
        <span key={item.label} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className={`h-2 w-2 rounded-[2px] ${item.className}`} />
          {item.label}
        </span>
      ))}
    </div>
  </div>
)

const STEPS = [
  {
    title: 'Grab your proxy URL',
    body: 'It’s already generated above — copy the base URL. No account needed to start.',
  },
  {
    title: 'Point your client at it',
    body: 'One env var. Claude Code, Codex, and every Anthropic or OpenAI SDK keep working unchanged.',
  },
  {
    title: 'Sign in to claim it',
    body: 'Recording starts with the first request. Sign in to keep the system and its history — sessions, per-request tokens, tool attribution, estimated cost.',
  },
] as const

const FEATURES = [
  {
    title: 'Zero added latency',
    body: 'Responses stream straight through; recording taps the stream off the critical path.',
  },
  {
    title: 'Keys never stored',
    body: 'Auth headers are forwarded, not held. API-key and subscription/OAuth clients both work.',
  },
  {
    title: 'Session trees',
    body: 'The chat APIs are stateless, so the proxy rebuilds each conversation, forks and all.',
  },
  {
    title: 'Tool-level attribution',
    body: 'See which tools actually burn the tokens, reconciled against real per-turn counts.',
  },
] as const

// The hero's first section: the visitor already holds a provisioned proxy URL
// (a draft system minted automatically on load, no button) with the setup
// instructions right here. Polls the public status endpoint; once traffic
// lands it flips to "sign in to claim," and App's claim gate attaches the draft
// to the new account after sign-in.
const DraftHero = ({ providers }: { providers: AuthProviders | null }) => {
  const [draftId, setDraftId] = useState<string | null>(() => readDraftId())
  const [status, setStatus] = useState<SystemStatus | null>(null)
  const [provisionError, setProvisionError] = useState(false)
  const provisioning = useRef(false)
  const started = useRef(false)
  const announced = useRef(false)
  const { navigate } = useRouter()
  const [demoLoading, setDemoLoading] = useState(false)
  const [demoError, setDemoError] = useState(false)

  const provision = useCallback(async () => {
    if (provisioning.current) return
    provisioning.current = true
    setProvisionError(false)
    try {
      const draft = await createDraftSystem()
      writeDraftId(draft.id)
      captureEvent('draft_created')
      setStatus(null)
      setDraftId(draft.id)
    } catch {
      setProvisionError(true)
    } finally {
      provisioning.current = false
    }
  }, [])

  // Auto-provision on first visit. `started` guards React's dev double-invoke
  // (and any re-render) so a visitor without a stored draft mints exactly one.
  useEffect(() => {
    if (draftId || started.current) return
    started.current = true
    void provision()
  }, [draftId, provision])

  useEffect(() => {
    if (!draftId) return
    let active = true
    const poll = () =>
      fetchSystemStatus(draftId)
        .then((s) => {
          if (active) setStatus(s)
        })
        // Transient failures skip a tick; the interval retries. A 404 (draft
        // swept) also just falls through — "Generate a new URL" starts fresh.
        .catch(() => {})
    void poll()
    const timer = setInterval(poll, POLL_MS)
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [draftId])

  const ready = status !== null && (status.seen || status.claimed)

  useEffect(() => {
    if (ready && !announced.current) {
      announced.current = true
      captureEvent('draft_traffic_seen', { requests: status?.requests ?? 0 })
    }
  }, [ready, status])

  const regenerate = () => {
    clearDraftId()
    setStatus(null)
    announced.current = false
    setDraftId(null)
    void provision()
  }

  // Seed the draft with sample data and open the read-only preview — the
  // zero-setup path to seeing real profiler output before wiring up a client.
  const runDemoAndPreview = async () => {
    if (!draftId) return
    setDemoLoading(true)
    setDemoError(false)
    captureEvent('demo_run')
    try {
      await runDemo(draftId)
      navigate(`/preview/${encodeURIComponent(draftId)}`)
    } catch {
      setDemoError(true)
      setDemoLoading(false)
    }
  }

  if (provisionError) {
    return (
      <Card className="border-status-critical/40">
        <CardContent className="space-y-3 pt-4">
          <p className="text-sm font-medium">Couldn’t generate a proxy URL</p>
          <p className="text-xs text-muted-foreground">
            Something went wrong setting up your system. Try again.
          </p>
          <Button onClick={() => void provision()}>Try again</Button>
        </CardContent>
      </Card>
    )
  }

  if (!draftId) {
    return <div className="h-72 animate-pulse rounded-xl border bg-muted/60" />
  }

  if (ready) {
    return (
      <Card className="border-status-serious/40">
        <CardContent className="space-y-4 pt-4">
          <div className="space-y-1">
            <p className="flex items-center gap-2 text-sm font-medium">
              <span className="inline-block h-2 w-2 rounded-full bg-status-serious" />
              {status?.requests
                ? `It’s working — ${status.requests} request${status.requests === 1 ? '' : 's'} recorded`
                : 'It’s working — traffic detected'}
            </p>
            <p className="text-xs text-muted-foreground">
              Sign in to claim this system and see the full breakdown. Everything recorded so far
              comes with it.
            </p>
          </div>
          <div id="signin">
            <SignInButtons providers={providers} placement="hero-claim" />
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Card className="border-status-serious/40">
        <CardContent className="space-y-3 pt-4">
          <div className="space-y-1">
            <p className="text-sm font-medium">See it in action first</p>
            <p className="text-xs text-muted-foreground">
              Load a real profiled coding session on sample data — no signup, no setup.
            </p>
          </div>
          <Button onClick={() => void runDemoAndPreview()} disabled={demoLoading}>
            {demoLoading ? 'Loading…' : 'See it with sample data'}
          </Button>
          {demoError && (
            <p className="text-xs text-status-critical">
              Couldn’t load the demo — please try again.
            </p>
          )}
        </CardContent>
      </Card>

      <p className="mt-4 mb-3 text-center text-xs text-muted-foreground">
        or profile your own traffic
      </p>

      <Card>
        <CardContent className="space-y-4 pt-4">
          <div className="space-y-1">
            <p className="text-sm font-medium">Your proxy URL is ready</p>
            <p className="text-xs text-muted-foreground">
              We generated one for you — no signup. Route an Anthropic or OpenAI client through it
              and usage shows up here.
            </p>
          </div>
          <SetupInstructions systemId={draftId} />
        </CardContent>
      </Card>
      <p className="mt-3 flex items-center justify-center gap-2 text-xs text-muted-foreground">
        <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-status-serious" />
        Waiting for the first request…
      </p>
      <div id="signin" className="mt-6 flex flex-col items-center gap-3 border-t pt-6">
        <p className="text-xs text-muted-foreground">Already have an account?</p>
        <SignInButtons providers={providers} placement="hero" />
        <button
          type="button"
          onClick={regenerate}
          className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          Generate a new URL
        </button>
      </div>
    </>
  )
}

export const LandingPage = () => {
  const [providers, setProviders] = useState<AuthProviders | null>(null)

  useEffect(() => {
    fetchAuthProviders()
      .then(setProviders)
      // If discovery fails, offer both: an unconfigured provider answers
      // with a polite 404 rather than breaking anything.
      .catch(() => setProviders({ google: true, github: true }))
  }, [])

  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2.5">
          <BrandMark className="h-7 w-7 rounded-[5px]" />
          <span className="text-base font-semibold tracking-tight">Token Profiler</span>
        </div>
        <a
          href="#signin"
          className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          Sign in
        </a>
      </header>

      <main className="mx-auto max-w-5xl px-6">
        <section className="space-y-8 py-12 md:py-16">
          <div className="mx-auto max-w-2xl space-y-4 text-center">
            <h1 className="text-4xl font-semibold tracking-tight text-balance">A simple AI profiler</h1>
            <p className="text-sm leading-relaxed text-secondary-ink">
              A transparent proxy in front of the Anthropic and OpenAI APIs. It forwards every
              request untouched and records token usage on the way back: per-request counts,
              sessions, tool-level attribution, and estimated cost.
            </p>
          </div>

          <div className="mx-auto max-w-2xl animate-fade-rise">
            <DraftHero providers={providers} />
          </div>
        </section>

        <section className="grid gap-10 border-t py-12 md:py-16 lg:grid-cols-2 lg:items-center">
          <ol className="space-y-6">
            {STEPS.map((step, i) => (
              <li key={step.title} className="flex gap-4">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-medium tabular-nums text-muted-foreground">
                  {i + 1}
                </span>
                <div className="space-y-1">
                  <p className="text-sm font-medium">{step.title}</p>
                  <p className="text-sm leading-relaxed text-muted-foreground">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>

          <DashboardMock />
        </section>

        <section className="grid gap-8 border-t py-12 sm:grid-cols-2 md:py-16 lg:grid-cols-4">
          {FEATURES.map((feature) => (
            <div key={feature.title} className="space-y-1.5">
              <p className="text-sm font-medium">{feature.title}</p>
              <p className="text-xs leading-relaxed text-muted-foreground">{feature.body}</p>
            </div>
          ))}
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-6 py-5">
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            <BrandMark className="h-4 w-4 rounded-[3px]" />
            Token Profiler
          </span>
          <p className="text-xs text-muted-foreground">Costs are estimates from list prices</p>
        </div>
      </footer>
    </div>
  )
}
