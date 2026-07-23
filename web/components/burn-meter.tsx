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
      <CardContent className="grid gap-0 p-0 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.25fr)]">
        {/* LEFT — spend read-out */}
        <div className="flex flex-col gap-3 p-6 md:border-r md:border-border">
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

        {/* RIGHT — anomaly-annotated spend chart */}
        <div className="flex flex-col gap-2 p-5 pt-6">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[13px] font-medium leading-snug text-foreground">
              {anomaly ? (
                <>
                  <span className="font-semibold text-status-critical">
                    {formatUtcDay(anomaly.day)} ran {anomaly.timesMedian}× the median day
                  </span>{' '}
                  <span className="text-muted-foreground">— the rest is context</span>
                </>
              ) : (
                <span className="text-muted-foreground">Spend per day — no anomaly this range</span>
              )}
            </span>
            {anomaly && (
              // TODO(stitch-gap): per-day drill-down view is not built yet
              <Unbacked variant="inline" label="Inspect day" note="day view not built">
                <span className="whitespace-nowrap text-[11px] text-ring">inspect day →</span>
              </Unbacked>
            )}
          </div>
          <SpendChart byDay={byDay} anomaly={anomaly} />
        </div>
      </CardContent>
    </Card>
  )
}

const CHART_H = 172
const M_TOP = 22
const M_BOTTOM = 22
const M_RIGHT = 40
const M_LEFT = 6

type Anomaly = ReturnType<typeof spendAnomaly>

// Smallest "nice" ceiling (1/2/2.5/5/10 × 10ⁿ) at or above v, for round axis ticks.
const niceCeil = (v: number): number => {
  if (v <= 0) return 1
  const mag = 10 ** Math.floor(Math.log10(v))
  const n = v / mag
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10
  return step * mag
}

const axisLabel = (t: number): string => (t >= 10 ? `$${Math.round(t)}` : `$${t.toFixed(1)}`)

const SpendChart = ({ byDay, anomaly }: { byDay: DayBucket[]; anomaly: Anomaly }) => {
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
  const rawMax = Math.max(...values, 0)
  const niceMax = niceCeil(rawMax)
  const ticks = [0, niceMax / 3, (2 * niceMax) / 3, niceMax]

  const anomalyIndex = anomaly ? byDay.findIndex((d) => d.day === anomaly.day) : -1
  const median = anomaly ? anomaly.cost / anomaly.timesMedian : null

  const plotB = CHART_H - M_BOTTOM
  const plotR = Math.max(width - M_RIGHT, M_LEFT + 1)
  const innerW = plotR - M_LEFT
  const innerH = plotB - M_TOP
  const yFor = (v: number) => plotB - (v / niceMax) * innerH

  const band = byDay.length > 0 ? innerW / byDay.length : 0
  const barW = Math.min(16, Math.max(1, band - 2))
  const centerX = (i: number) => M_LEFT + i * band + band / 2

  // x-axis: first, middle, last day labels.
  const xTickIdx =
    byDay.length > 2 ? [0, Math.floor((byDay.length - 1) / 2), byDay.length - 1] : byDay.map((_, i) => i)

  return (
    <div ref={containerRef} className="w-full">
      {!hasSpend ? (
        <div
          className="flex items-center justify-center text-xs text-muted-foreground"
          style={{ height: CHART_H }}
        >
          No spend recorded in this range.
        </div>
      ) : (
        width > 0 && (
          <svg
            width={width}
            height={CHART_H}
            role="img"
            aria-label={
              anomaly
                ? `Spend per day, with a ${anomaly.timesMedian}× median spike on ${formatUtcDay(anomaly.day)}`
                : 'Spend per day'
            }
          >
            {/* y gridlines + right-edge $ labels */}
            {ticks.map((t) => (
              <g key={`y-${t}`}>
                <line
                  x1={M_LEFT}
                  x2={plotR}
                  y1={yFor(t)}
                  y2={yFor(t)}
                  stroke={t === 0 ? 'var(--axis)' : 'var(--gridline)'}
                  strokeWidth="1"
                />
                <text
                  x={plotR + 6}
                  y={yFor(t) + 3}
                  fill="var(--muted-foreground)"
                  fontSize="9"
                  fontFamily="var(--font-mono)"
                >
                  {axisLabel(t)}
                </text>
              </g>
            ))}

            {/* dashed median reference line + label */}
            {median !== null && (
              <>
                <line
                  x1={M_LEFT}
                  x2={plotR}
                  y1={yFor(median)}
                  y2={yFor(median)}
                  stroke="var(--axis)"
                  strokeWidth="1"
                  strokeDasharray="3 3"
                />
                <text
                  x={M_LEFT + 2}
                  y={yFor(median) - 5}
                  fill="var(--muted-foreground)"
                  fontSize="9.5"
                  fontFamily="var(--font-mono)"
                >
                  median {axisLabel(median)}
                </text>
              </>
            )}

            {/* bars — muted, anomaly in rose */}
            {byDay.map((d, i) => {
              const v = d.cost ?? 0
              const y = yFor(v)
              const h = Math.max(0, plotB - y)
              const isAnomaly = i === anomalyIndex
              return (
                <rect
                  key={d.day}
                  x={M_LEFT + i * band + (band - barW) / 2}
                  y={y}
                  width={barW}
                  height={h}
                  rx={Math.min(2, barW / 2)}
                  fill={isAnomaly ? 'var(--status-critical)' : 'var(--muted-foreground)'}
                  opacity={isAnomaly ? 1 : 0.32}
                />
              )
            })}

            {/* anomaly value label above its bar */}
            {anomaly && anomalyIndex >= 0 && (
              <text
                x={Math.min(Math.max(centerX(anomalyIndex), 28), plotR - 4)}
                y={yFor(anomaly.cost) - 5}
                fill="var(--status-critical)"
                fontSize="10.5"
                fontWeight="700"
                textAnchor="middle"
                fontFamily="var(--font-mono)"
              >
                {formatUsd(anomaly.cost)}
              </text>
            )}

            {/* x-axis day labels */}
            {xTickIdx.map((i) => (
              <text
                key={`x-${i}`}
                x={centerX(i)}
                y={CHART_H - 6}
                fill="var(--muted-foreground)"
                fontSize="9.5"
                textAnchor={i === 0 ? 'start' : i === byDay.length - 1 ? 'end' : 'middle'}
                fontFamily="var(--font-mono)"
              >
                {formatUtcDay(byDay[i]!.day)}
              </text>
            ))}
          </svg>
        )
      )}
    </div>
  )
}
