import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { DashboardTotals, PendingSystem, RangeKey } from '../../shared/api-types'
import { isUnauthorized } from '../lib/api'
import { queryKeys, useDashboard } from '../lib/queries'
import { formatPercent, formatRelative, formatTimestamp } from '../lib/format'
import { cn } from '../lib/utils'
import { Link } from '../lib/router'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { StatStrip, StatTile } from '../components/stat-tile'
import { BurnMeter } from '../components/burn-meter'
import { tokenMixByCount } from '../lib/dashboard-metrics'
import { TokensChartCard } from '../components/tokens-chart'
import { ModelsCard } from '../components/models-card'
import { ProvidersCard } from '../components/providers-card'
import { ToolsCard } from '../components/tools-card'
import { SystemsCard } from '../components/systems-card'
import { SessionsCard } from '../components/sessions-card'
import { RequestsCard } from '../components/requests-card'
import { SetupInstructions } from '../components/setup-instructions'
import { OnboardingView } from './onboarding'

const RANGES: { key: RangeKey; label: string }[] = [
  { key: '7d', label: 'Last 7 days' },
  { key: '30d', label: 'Last 30 days' },
  { key: '90d', label: 'Last 90 days' },
  { key: 'all', label: 'All time' },
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

// Compact glance-layer strip: token usage split as a single stacked bar, backed
// by tokenMixByCount (by token count — the API returns counts, not per-type
// cost). Identity is never color-alone: every segment is named with its label
// and percent in the legend. Segment colors are dynamic `var(--chart-*)` token
// refs, so they ride in via inline style per design-system.md §6 (the same
// JS-literal convention tokens-chart uses for its SVG fills).
const TokenMixStrip = ({ totals }: { totals: DashboardTotals }) => {
  const mix = tokenMixByCount(totals)
  const hasTokens = mix.some((m) => m.share > 0)
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4">
        <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
          Token mix · by count
        </span>
        {hasTokens ? (
          <>
            <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
              {mix.map((m) =>
                m.share > 0 ? (
                  <div
                    key={m.key}
                    style={{ width: `${m.share * 100}%`, backgroundColor: m.color }}
                    title={`${m.label} ${formatPercent(m.share)}`}
                  />
                ) : null,
              )}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {mix.map((m) => (
                <span
                  key={m.key}
                  className="inline-flex items-center gap-1.5 text-xs text-secondary-ink"
                >
                  <span
                    className="h-2 w-2 rounded-[2px]"
                    style={{ backgroundColor: m.color }}
                    aria-hidden="true"
                  />
                  {m.label}
                  <span className="font-mono tabular-nums text-muted-foreground">
                    {formatPercent(m.share)}
                  </span>
                </span>
              ))}
            </div>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">No token usage recorded in this range.</p>
        )}
      </CardContent>
    </Card>
  )
}

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
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
          {data && (
            <p className="pt-1 text-xs text-muted-foreground">
              Updated {formatTimestamp(data.generatedAt)}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border bg-muted p-0.5">
            {RANGES.map((r) => (
              <button
                key={r.key}
                type="button"
                aria-pressed={range === r.key}
                onClick={() => setRange(r.key)}
                className={cn(
                  'rounded-md px-3 py-1 text-xs font-medium transition-colors',
                  range === r.key
                    ? 'bg-card text-foreground shadow-2xs'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
          <Button onClick={() => void refetch()} disabled={isFetching} aria-label="Refresh">
            <svg
              width="12"
              height="12"
              viewBox="0 0 16 16"
              aria-hidden="true"
              className={cn(isFetching && 'animate-spin')}
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
            Refresh
          </Button>
        </div>
      </div>

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
          className={cn(
            'space-y-4 transition-opacity',
            isFetching && 'pointer-events-none opacity-60',
          )}
        >
          {data.pendingSystems.map((s) => (
            <PendingSystemCard key={s.id} system={s} generatedAt={data.generatedAt} />
          ))}

          {/* GLANCE LAYER — the lit read-at-a-distance summary: spend hero,
              secondary-KPI strip, token-mix. */}
          <BurnMeter
            totals={data.totals}
            byDay={data.byDay}
            providers={data.providers}
            range={data.range}
            generatedAt={data.generatedAt}
          />

          <StatStrip className="grid-cols-2 md:grid-cols-4 xl:grid-cols-8">
            <StatTile label="Requests" value={data.totals.requests} />
            <StatTile label="Sessions" value={data.totals.sessions} />
            <StatTile label="Systems" value={data.systems.length} />
            <StatTile label="Est. cost" value={data.totals.cost} format="usd" />
            <StatTile label="Input" value={data.totals.inputTokens} />
            <StatTile label="Output" value={data.totals.outputTokens} />
            <StatTile label="Cache read" value={data.totals.cacheReadTokens} />
            <StatTile label="Cache write" value={data.totals.cacheCreationTokens} />
          </StatStrip>

          <TokenMixStrip totals={data.totals} />

          {/* DENSITY LAYER — the instrument body: trend chart then attribution
              tables, coarse to fine. */}
          <TokensChartCard byDay={data.byDay} range={data.range} generatedAt={data.generatedAt} />

          <section className="grid gap-4 lg:grid-cols-5">
            <div className="lg:col-span-3">
              <ModelsCard byModel={data.byModel} />
            </div>
            <div className="lg:col-span-2">
              <ProvidersCard providers={data.providers} />
            </div>
          </section>

          <ToolsCard
            tools={data.byTool}
            description="Tokens attributed to each tool in this range. Input is the tool_use arguments the model wrote (the model's output tokens); output is the tool result sent back (the model's input tokens next turn). Estimates, calibrated per turn where usage deltas allow."
          />

          <SystemsCard systems={data.systems} generatedAt={data.generatedAt} />
          <SessionsCard sessions={data.sessions} generatedAt={data.generatedAt} />
          <RequestsCard requests={data.recentRequests} showSession />
        </div>
      )}
    </div>
  )
}

const DashboardSkeleton = () => (
  <div className="space-y-4">
    <div className="h-24 animate-pulse rounded-lg border bg-muted/60" />
    <div className="h-80 animate-pulse rounded-lg border bg-muted/60" />
    <div className="h-56 animate-pulse rounded-lg border bg-muted/60" />
  </div>
)
