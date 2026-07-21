import { useEffect, useMemo, useState } from 'react'
import type { RangeKey } from '../../shared/api-types'
import { isUnauthorized } from '../lib/api'
import { useDashboard } from '../lib/queries'
import { formatInt, formatPercent, formatTimestamp, formatUsd, formatUtcDay } from '../lib/format'
import { cn } from '../lib/utils'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table'
import { DashboardMetricCard, type DashboardCardPoint } from '../design-system/examples/dashboard-card'

const RANGES: { key: RangeKey; label: string }[] = [
  { key: '7d', label: 'Last 7 days' },
  { key: '30d', label: 'Last 30 days' },
  { key: '90d', label: 'Last 90 days' },
  { key: 'all', label: 'All time' },
]

type BudgetStatus = 'within-budget' | 'near-limit' | 'over-budget'

const statusForShare = (share: number): BudgetStatus => {
  if (share > 0.5) return 'over-budget'
  if (share > 0.25) return 'near-limit'
  return 'within-budget'
}

// DESIGN BRIEF: "white text on the status badges" — the only token pairing
// the design system defines for text-on-solid fills is
// status-critical-foreground, and only for the critical status
// (mode-aware since the Iris restyle: light #fafafa, dark ink); there
// is no status-good-foreground / status-serious-foreground counterpart to
// make a solid-fill + white-text treatment consistent across all three
// statuses. Resolved by matching the golden example's existing tinted
// badge convention instead (web/design-system/examples/data-table.tsx
// STATUS_STYLE: bg-status-*/10 + text-status-*), which is already
// token-pure and uniform across all three statuses.
const STATUS_STYLE: Record<BudgetStatus, { label: string; className: string }> = {
  'within-budget': { label: 'within budget', className: 'bg-status-good/10 text-status-good' },
  'near-limit': { label: 'near limit', className: 'bg-status-serious/10 text-status-serious' },
  'over-budget': { label: 'over budget', className: 'bg-status-critical/10 text-status-critical' },
}

export const CostsPage = () => {
  const [range, setRange] = useState<RangeKey>('30d')
  const { data, error, isFetching, refetch } = useDashboard(range)

  useEffect(() => {
    if (isUnauthorized(error)) window.location.reload()
  }, [error])

  const totalCost = data?.totals.cost ?? 0

  const rows = useMemo(() => {
    if (!data) return []
    return [...data.byModel]
      .sort((a, b) => (b.cost ?? 0) - (a.cost ?? 0))
      .map((m) => ({ ...m, status: statusForShare(totalCost > 0 ? (m.cost ?? 0) / totalCost : 0) }))
  }, [data, totalCost])

  const costSeries: DashboardCardPoint[] = useMemo(
    () => (data ? data.byDay.map((d) => ({ label: formatUtcDay(d.day), value: d.cost ?? 0 })) : []),
    [data],
  )
  const requestSeries: DashboardCardPoint[] = useMemo(
    () => (data ? data.byDay.map((d) => ({ label: formatUtcDay(d.day), value: d.requests })) : []),
    [data],
  )
  const cacheReadSeries: DashboardCardPoint[] = useMemo(
    () =>
      data
        ? data.byDay.map((d) => {
            const total = d.inputTokens + d.outputTokens + d.cacheReadTokens + d.cacheCreationTokens
            return { label: formatUtcDay(d.day), value: total > 0 ? d.cacheReadTokens / total : 0 }
          })
        : [],
    [data],
  )

  const totalTokens = data
    ? data.totals.inputTokens +
      data.totals.outputTokens +
      data.totals.cacheReadTokens +
      data.totals.cacheCreationTokens
    : 0
  const cacheReadShare = data && totalTokens > 0 ? data.totals.cacheReadTokens / totalTokens : 0

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Costs</h1>
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

      {!data && !error && (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="h-32 animate-pulse rounded-lg border bg-muted/60" />
            <div className="h-32 animate-pulse rounded-lg border bg-muted/60" />
            <div className="h-32 animate-pulse rounded-lg border bg-muted/60" />
          </div>
          <div className="h-72 animate-pulse rounded-lg border bg-muted/60" />
        </div>
      )}

      {data && (
        <div
          className={cn(
            'space-y-4 transition-opacity',
            isFetching && 'pointer-events-none opacity-60',
          )}
        >
          <div className="grid gap-4 md:grid-cols-3">
            {/* DESIGN BRIEF: "Google-blue #4285F4 accents for the primary
                cost metric" — resolved to the chart-input token, the
                design system's existing blue (see .claude/design-system.md
                §6, the sanctioned var(--chart-*) JS-literal convention).
                The Card's own border/ring tokens are token-pure by
                default, so the accent is expressed via the border utility
                class plus the sparkline series color rather than a
                one-off hardcoded border. */}
            <div className="rounded-lg border-2 border-chart-input">
              <DashboardMetricCard
                title="Total estimated cost"
                description="List-price estimate for this range"
                value={formatUsd(data.totals.cost)}
                series={costSeries}
                seriesColor="var(--chart-input)"
              />
            </div>
            <DashboardMetricCard
              title="Total requests"
              description="Proxied requests in this range"
              value={formatInt(data.totals.requests)}
              series={requestSeries}
              seriesColor="var(--chart-output)"
            />
            <DashboardMetricCard
              title="Cache-read share"
              description="Share of prompt tokens served from cache"
              value={formatPercent(cacheReadShare)}
              series={cacheReadSeries}
              seriesColor="var(--chart-cache-read)"
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Cost by model</CardTitle>
              <CardDescription>Ordered by estimated cost · list prices</CardDescription>
            </CardHeader>
            <CardContent className="p-0 pb-2">
              <Table>
                {/* DESIGN BRIEF: "soft gray #f8f9fa background for the table
                    header row" — resolved to the muted token, the design
                    system's existing soft-gray surface (web/index.css
                    --muted; see .claude/design-system.md §1). */}
                <TableHeader>
                  <TableRow className="bg-muted">
                    <TableHead>Model</TableHead>
                    <TableHead className="text-right">Requests</TableHead>
                    <TableHead className="text-right">Cache read</TableHead>
                    <TableHead className="text-right">Est. cost</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="py-6 text-center text-xs text-muted-foreground">
                        No requests recorded in this range.
                      </TableCell>
                    </TableRow>
                  ) : (
                    rows.map((row) => (
                      <TableRow key={row.model}>
                        <TableCell className="font-mono text-xs">{row.model}</TableCell>
                        <TableCell className="text-right text-xs tabular-nums">
                          {formatInt(row.requests)}
                        </TableCell>
                        <TableCell className="text-right text-xs tabular-nums">
                          {formatInt(row.cacheReadTokens)}
                        </TableCell>
                        <TableCell className="text-right text-xs font-medium tabular-nums">
                          {formatUsd(row.cost)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={STATUS_STYLE[row.status].className}>
                            {STATUS_STYLE[row.status].label}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
