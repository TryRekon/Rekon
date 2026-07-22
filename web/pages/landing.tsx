import { Link } from '../lib/router'
import { BrandMark } from '../components/sidebar'

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
    title: 'Sign in',
    body: 'Google or GitHub. A proxy URL for your first system is provisioned automatically — no config, no credit card.',
  },
  {
    title: 'Point your client at it',
    body: 'One env var. Claude Code, Codex, and every Anthropic or OpenAI SDK keep working unchanged.',
  },
  {
    title: 'Watch the usage land',
    body: 'Per-request tokens, sessions, tool-level attribution, and estimated cost show up here as traffic flows.',
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

const ctaClass =
  'inline-flex h-10 items-center justify-center rounded-md bg-foreground px-5 text-sm font-medium text-background transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-ring'

export const LandingPage = () => (
  <div className="min-h-dvh">
    <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
      <div className="flex items-center gap-2.5">
        <BrandMark className="h-7 w-7 rounded-[5px]" />
        <span className="text-base font-semibold tracking-tight">Token Profiler</span>
      </div>
      <Link
        href="/login"
        className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        Sign in
      </Link>
    </header>

    <main className="mx-auto max-w-5xl px-6">
      <section className="grid items-center gap-10 py-12 md:py-20 lg:grid-cols-2">
        <div className="space-y-6">
          <h1 className="text-4xl font-semibold tracking-tight text-balance md:text-5xl">
            A simple AI profiler
          </h1>
          <p className="max-w-md text-base leading-relaxed text-secondary-ink">
            A transparent proxy in front of the Anthropic and OpenAI APIs. It forwards every request
            untouched and records token usage on the way back: per-request counts, sessions,
            tool-level attribution, and estimated cost.
          </p>
          <div className="flex flex-col items-start gap-2">
            <Link href="/login" className={ctaClass}>
              Sign in to get started
            </Link>
            <p className="text-xs text-muted-foreground">Google or GitHub · costs are estimates from list prices</p>
          </div>
        </div>

        <div className="animate-fade-rise">
          <DashboardMock />
        </div>
      </section>

      <section className="border-t py-12 md:py-16">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          How it works
        </p>
        <ol className="mt-6 grid gap-8 sm:grid-cols-3">
          {STEPS.map((step, i) => (
            <li key={step.title} className="space-y-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full border text-xs font-medium tabular-nums text-muted-foreground">
                {i + 1}
              </span>
              <p className="text-sm font-medium">{step.title}</p>
              <p className="text-sm leading-relaxed text-muted-foreground">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="grid gap-8 border-t py-12 sm:grid-cols-2 md:py-16 lg:grid-cols-4">
        {FEATURES.map((feature) => (
          <div key={feature.title} className="space-y-1.5">
            <p className="text-sm font-medium">{feature.title}</p>
            <p className="text-xs leading-relaxed text-muted-foreground">{feature.body}</p>
          </div>
        ))}
      </section>

      <section className="flex flex-col items-center gap-4 border-t py-12 text-center md:py-16">
        <h2 className="text-2xl font-semibold tracking-tight">Start profiling in a minute</h2>
        <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
          Sign in, point your client at the proxy URL, and watch your token usage land.
        </p>
        <Link href="/login" className={ctaClass}>
          Sign in to get started
        </Link>
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
