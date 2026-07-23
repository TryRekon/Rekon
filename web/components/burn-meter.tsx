import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import type {
  DashboardTotals,
  DayBucket,
  ProviderSummary,
  RangeKey,
} from '../../shared/api-types'
import { Card, CardContent } from './ui/card'
import { Badge } from './ui/badge'
import { Unbacked } from './ui/unbacked'
import { cacheHitRatio, paceProjection, spendAnomaly } from '../lib/dashboard-metrics'
import { formatPercent, formatUsd, formatUtcDay } from '../lib/format'

/**
 * BurnMeter — the glance-layer hero (plan U4). An editorial spend read-out:
 * a large mono INK spend figure (money is never accent-colored, per the Iris
 * convention), a pace projection line, backed status chips, and an
 * anomaly-annotated spend sparkline.
 *
 * Backed metrics (spend, pace, cache-hit, provider split, anomaly) render live
 * from DashboardData via web/lib/dashboard-metrics.ts. The delta-vs-previous
 * chip is NOT backed by the dashboard endpoint and is rendered inside
 * <Unbacked> so it reads as "coming, not wired" rather than a fabricated
 * number (see the TODO(stitch-gap) below).
 *
 * SVG colors are consumed as `var(--token)` JS-literals (design-system.md §6),
 * never as raw hex.
 */

// The minimal DashboardData slice the hero actually consumes.
export interface BurnMeterProps {
  totals: DashboardTotals
  byDay: DayBucket[]
  providers: ProviderSummary[]
  range: RangeKey
  generatedAt: number
}

export const BurnMeter = ({
  totals,
  byDay,
  providers,
  range,
  generatedAt,
}: BurnMeterProps) => {
  const pace = useMemo(
    () => paceProjection(byDay, range, generatedAt),
    [byDay, range, generatedAt],
  )
  const anomaly = useMemo(() => spendAnomaly(byDay), [byDay])
  const cacheHit = cacheHitRatio(totals)

  // Provider split from request counts — top two providers by volume.
  const providerSplit = useMemo(() => {
    const totalReq = providers.reduce((acc, p) => acc + p.requests, 0)
    if (totalReq === 0) return ''
    return [...providers]
      .sort((a, b) => b.requests - a.requests)
      .slice(0, 2)
      .filter((p) => p.requests > 0)
      .map((p) => `${p.name} ${formatPercent(p.requests / totalReq)}`)
      .join(' · ')
  }, [providers])

  return (
    <Card>
      <CardContent className="grid gap-6 p-6 pt-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] md:items-center">
        {/* LEFT — spend read-out */}
        <div className="flex flex-col gap-3">
          <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            Estimated spend · this period
          </span>

          {/* Money stays ink, never accent (Iris convention). */}
          <span className="font-mono text-5xl font-semibold leading-none tracking-tight tabular-nums text-foreground">
            {formatUsd(totals.cost)}
          </span>

          <span className="text-sm text-secondary-ink">
            on pace for{' '}
            <span className="font-mono tabular-nums text-foreground">
              {formatUsd(pace.projected)}
            </span>{' '}
            {pace.periodLabel}
          </span>

          <div className="mt-1 flex flex-wrap items-center gap-2">
            <Badge>Cache hit {formatPercent(cacheHit)}</Badge>
            {providerSplit && <Badge>{providerSplit}</Badge>}
            {/* TODO(stitch-gap): no prior-period aggregate on the dashboard endpoint; wire when the API returns previous-window totals */}
            <Unbacked
              variant="inline"
              label="Change vs previous period"
              note="needs prior-window totals"
            >
              <Badge>
                <span className="font-mono tabular-nums">—</span> vs previous
              </Badge>
            </Unbacked>
          </div>
        </div>

        {/* RIGHT — anomaly-annotated spend sparkline */}
        <AnomalySparkline byDay={byDay} anomaly={anomaly} />
      </CardContent>
    </Card>
  )
}

const SPARK_H = 132
const SPARK_PAD_TOP = 22
const SPARK_PAD_BOTTOM = 6

type Anomaly = ReturnType<typeof spendAnomaly>

const AnomalySparkline = ({
  byDay,
  anomaly,
}: {
  byDay: DayBucket[]
  anomaly: Anomaly
}) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)

  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) setWidth(entry.contentRect.width)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const values = byDay.map((d) => d.cost ?? 0)
  const hasSpend = values.some((v) => v > 0)
  const max = Math.max(...values, 0) || 1
  const anomalyIndex = anomaly ? byDay.findIndex((d) => d.day === anomaly.day) : -1
  // Recover the median the anomaly was measured against for the reference line.
  const median = anomaly ? anomaly.cost / anomaly.timesMedian : null

  const innerH = SPARK_H - SPARK_PAD_TOP - SPARK_PAD_BOTTOM
  const baselineY = SPARK_PAD_TOP + innerH
  const yFor = (v: number) => baselineY - (v / max) * innerH

  const band = byDay.length > 0 ? width / byDay.length : 0
  const barW = Math.min(14, Math.max(1, band - 2))
  const anomalyX =
    anomalyIndex >= 0 ? anomalyIndex * band + band / 2 : 0

  return (
    <div ref={containerRef} className="relative w-full">
      {!hasSpend ? (
        <div
          className="flex items-center justify-center text-xs text-muted-foreground"
          style={{ height: SPARK_H }}
        >
          No spend recorded in this range.
        </div>
      ) : (
        width > 0 && (
          <>
            <svg
              width={width}
              height={SPARK_H}
              role="img"
              aria-label={
                anomaly
                  ? `Spend per day, with a ${anomaly.timesMedian}× median spike on ${formatUtcDay(anomaly.day)}`
                  : 'Spend per day'
              }
            >
              {/* Faint median reference line — only when an anomaly is flagged. */}
              {median !== null && (
                <line
                  x1={0}
                  x2={width}
                  y1={yFor(median)}
                  y2={yFor(median)}
                  stroke="var(--axis)"
                  strokeWidth="1"
                  strokeDasharray="3 3"
                />
              )}
              {byDay.map((d, i) => {
                const v = d.cost ?? 0
                const x = i * band + (band - barW) / 2
                const y = yFor(v)
                const h = Math.max(0, baselineY - y)
                const isAnomaly = i === anomalyIndex
                return (
                  <rect
                    key={d.day}
                    x={x}
                    y={y}
                    width={barW}
                    height={h}
                    rx={Math.min(2, barW / 2)}
                    fill={isAnomaly ? 'var(--status-critical)' : 'var(--muted-foreground)'}
                    opacity={isAnomaly ? 1 : 0.5}
                  />
                )
              })}
            </svg>

            {/* In-situ anomaly callout, anchored over the spike. */}
            {anomaly && anomalyIndex >= 0 && (
              <div
                className="pointer-events-none absolute top-0 -translate-x-1/2 whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.1em] tabular-nums text-status-critical"
                style={{
                  left: Math.min(Math.max(anomalyX, 48), Math.max(width - 48, 48)),
                }}
              >
                {formatUtcDay(anomaly.day)} · {anomaly.timesMedian}× median
              </div>
            )}
          </>
        )
      )}
    </div>
  )
}
