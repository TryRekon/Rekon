import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { DashboardData, PendingSystem, RangeKey } from '../../shared/api-types'
import { isUnauthorized } from '../lib/api'
import { queryKeys, useDashboard } from '../lib/queries'
import { formatCompact, formatInt, formatRelative, formatUsd, formatUtcDay } from '../lib/format'
import { cn } from '../lib/utils'
import { Link } from '../lib/router'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { BurnMeterBody } from '../components/burn-meter'
import { TokenMixStrip } from '../components/token-mix-strip'
import { AttributionColumns } from '../components/attribution-columns'
import { SetupInstructions } from '../components/setup-instructions'
import { OnboardingView } from './onboarding'

const RANGES: { key: RangeKey; label: string }[] = [
  { key: '7d', label: '7d' },
  { key: '30d', label: '30d' },
  { key: '90d', label: '90d' },
  { key: 'all', label: 'All' },
]

// A provisioned system that hasn't seen traffic yet: its ingest URL up front,
// full client setup behind a disclosure.
const PendingSystemCard = ({
  system,
  generatedAt,
}: {
  system: PendingSystem
  generatedAt: number
}) => (
  <Card>
    <CardHeader>
      <div className="flex flex-wrap items-center gap-2">
        <CardTitle>{system.name}</CardTitle>
        <Badge variant="outline">
          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-status-serious" />
          waiting for first request
        </Badge>
      </div>
      <CardDescription>
        Created {formatRelative(system.createdAt, generatedAt)} — it will appear in the systems
        table once traffic flows through its proxy URL.{' '}
        <Link
          href={`/systems/${encodeURIComponent(system.id)}`}
          className="underline-offset-2 hover:underline"
        >
          Rename
        </Link>
      </CardDescription>
    </CardHeader>
    <CardContent>
      <SetupInstructions systemId={system.id} />
    </CardContent>
  </Card>
)

export const DashboardPage = () => {
  const [range, setRange] = useState<RangeKey>('30d')
  const { data, error, isFetching, refetch } = useDashboard(range)
  const queryClient = useQueryClient()
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    void queryClient.invalidateQueries({ queryKey: queryKeys.systems })
  }

  // An expired session mid-visit: reload so the App shell re-probes /me and
  // lands on the login page.
  useEffect(() => {
    if (isUnauthorized(error)) window.location.reload()
  }, [error])

  // First-run: no system has ever received traffic. useDashboard polls in
  // this state, so the dashboard takes over the moment the first proxied
  // request lands.
  if (data && data.activeSystemCount === 0) {
    return <OnboardingView pending={data.pendingSystems[0] ?? null} onRefresh={invalidate} />
  }

  return (
    <div className="space-y-4">
      {error && (
        <Card className="border-status-critical/40">
          <CardHeader>
            <CardTitle>Could not load data</CardTitle>
            <CardDescription>{error.message}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => void refetch()}>Retry</Button>
          </CardContent>
        </Card>
      )}

      {!data && !error && <DashboardSkeleton />}

      {data && (
        <div
          className={cn('space-y-4 transition-opacity', isFetching && 'pointer-events-none opacity-60')}
        >
          {data.pendingSystems.map((s) => (
            <PendingSystemCard key={s.id} system={s} generatedAt={data.generatedAt} />
          ))}

          {/* One edge-to-edge surface: hairline rules divide the regions, no
              per-section card gaps or shadows (dashboard 1:1 match). */}
          <div className="overflow-hidden rounded-lg border bg-card">
            <TopBar
              data={data}
              range={range}
              onRange={setRange}
              onRefresh={() => void refetch()}
              busy={isFetching}
            />

            {/* GLANCE — spend hero */}
            <div className="border-b border-border">
              <BurnMeterBody
                totals={data.totals}
                byDay={data.byDay}
                providers={data.providers}
                range={data.range}
                generatedAt={data.generatedAt}
              />
            </div>

            {/* DENSITY — flat KPI strip */}
            <KpiRow data={data} />

            <div className="border-b border-border">
              <TokenMixStrip totals={data.totals} />
            </div>

            <AttributionColumns
              systems={data.systems}
              sessions={data.sessions}
              byModel={data.byModel}
              byTool={data.byTool}
            />

            <FootLine data={data} />
          </div>
        </div>
      )}
    </div>
  )
}

// The surface's top rule: resolved date-range label on the left; range toggle,
// refresh, and the live/updated stamp on the right.
const TopBar = ({
  data,
  range,
  onRange,
  onRefresh,
  busy,
}: {
  data: DashboardData
  range: RangeKey
  onRange: (r: RangeKey) => void
  onRefresh: () => void
  busy: boolean
}) => {
  const first = data.byDay[0]?.day
  const last = data.byDay[data.byDay.length - 1]?.day
  const rangeLabel =
    first && last
      ? `${formatUtcDay(first).toUpperCase()} – ${formatUtcDay(last, true).toUpperCase()}`
      : 'ALL TIME'
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5 md:px-6">
      <div className="font-mono text-[13px] font-semibold tracking-tight text-foreground">
        {rangeLabel}
        <span className="ml-2 font-sans text-xs font-normal text-muted-foreground">
          · {data.byDay.length} days · UTC
        </span>
      </div>
      <div className="flex items-center gap-2">
        <div className="inline-flex rounded-md border bg-muted p-0.5">
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              aria-pressed={range === r.key}
              onClick={() => onRange(r.key)}
              className={cn(
                'rounded-[5px] px-2.5 py-0.5 font-mono text-[11px] font-medium transition-colors',
                range === r.key
                  ? 'bg-card text-foreground shadow-2xs'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
        <Button onClick={onRefresh} disabled={busy} aria-label="Refresh" variant="outline" size="sm">
          <svg
            width="12"
            height="12"
            viewBox="0 0 16 16"
            aria-hidden="true"
            className={cn(busy && 'animate-spin')}
          >
            <path
              d="M13.5 8a5.5 5.5 0 1 1-1.61-3.89M13.5 1.5V4.5h-3"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </Button>
      </div>
    </div>
  )
}

const KPIS: { label: string; get: (d: DashboardData) => string }[] = [
  { label: 'Requests', get: (d) => formatInt(d.totals.requests) },
  { label: 'Sessions', get: (d) => formatInt(d.totals.sessions) },
  { label: 'Systems', get: (d) => formatInt(d.systems.length) },
  { label: 'Input', get: (d) => formatCompact(d.totals.inputTokens) },
  { label: 'Output', get: (d) => formatCompact(d.totals.outputTokens) },
  { label: 'Cache read', get: (d) => formatCompact(d.totals.cacheReadTokens) },
  { label: 'Cache write', get: (d) => formatCompact(d.totals.cacheCreationTokens) },
  {
    label: 'Avg / session',
    get: (d) => formatUsd(d.totals.sessions > 0 ? d.totals.cost / d.totals.sessions : 0),
  },
]

const KpiRow = ({ data }: { data: DashboardData }) => (
  // Hairline dividers are drawn by a 1px grid gap over a hairline ground (cells
  // are bg-card) — correct at every responsive column count and any KPI count,
  // with no nth-child arithmetic. The region's own border-b closes the bottom.
  <div className="grid grid-cols-2 gap-px border-b border-border bg-hairline md:grid-cols-4 xl:grid-cols-8">
    {KPIS.map((k) => (
      <div key={k.label} className="bg-card px-3.5 py-3">
        <span className="font-sans text-[9.5px] font-semibold tracking-[0.15em] uppercase text-muted-foreground">
          {k.label}
        </span>
        <div className="mt-1.5 font-mono text-[18px] font-medium tabular-nums text-foreground">
          {k.get(data)}
        </div>
      </div>
    ))}
  </div>
)

const FootLine = ({ data }: { data: DashboardData }) => (
  <div className="flex flex-wrap gap-x-6 gap-y-1 px-4 py-2.5 text-[11px] text-muted-foreground md:px-6">
    <span className="font-mono">
      {data.systems.length} systems · {data.providers.length} providers
    </span>
    <span className="font-mono">
      {formatCompact(data.totals.inputTokens)} in · {formatCompact(data.totals.outputTokens)} out ·{' '}
      {formatCompact(data.totals.cacheReadTokens)} cache read
    </span>
    <span>estimates use provider list prices</span>
  </div>
)

const DashboardSkeleton = () => (
  <div className="overflow-hidden rounded-lg border bg-card">
    <div className="h-12 animate-pulse border-b bg-muted/60" />
    <div className="h-64 animate-pulse border-b bg-muted/40" />
    <div className="h-20 animate-pulse border-b bg-muted/60" />
    <div className="h-72 animate-pulse bg-muted/40" />
  </div>
)
