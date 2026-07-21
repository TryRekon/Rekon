import { useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { PendingSystem, RangeKey } from '../../shared/api-types'
import { isUnauthorized } from '../lib/api'
import { queryKeys, useDashboard } from '../lib/queries'
import { formatRelative, formatTimestamp, formatUsd, formatUtcDay } from '../lib/format'
import { cn } from '../lib/utils'
import { Link } from '../lib/router'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { StatStrip, StatTile } from '../components/stat-tile'
import { TokensChartCard } from '../components/tokens-chart'
import {
  DashboardMetricCard,
  type DashboardCardPoint,
} from '../design-system/examples/dashboard-card'
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

export const DashboardPage = () => {
  const [range, setRange] = useState<RangeKey>('30d')
  const { data, error, isFetching, refetch } = useDashboard(range)
  const queryClient = useQueryClient()
  const spendSeries: DashboardCardPoint[] = useMemo(
    () => (data ? data.byDay.map((d) => ({ label: formatUtcDay(d.day), value: d.cost ?? 0 })) : []),
    [data],
  )
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

          <div className="grid gap-4 md:grid-cols-3">
            <DashboardMetricCard
              title="Spend trend"
              description="Estimated cost per day, list prices"
              value={formatUsd(data.totals.cost)}
              series={spendSeries}
              seriesColor="var(--chart-input)"
            />
          </div>

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
