import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card'
import { Badge } from '../../components/ui/badge'
import { cn } from '../../lib/utils'
import { formatPercent } from '../../lib/format'

/**
 * Golden example (R7, R8) — match this file for any new dashboard metric
 * card with an inline chart. Composed from web/components/ui/card.tsx and
 * web/components/ui/badge.tsx; the sparkline consumes a color token via the
 * chart JS-literal convention (.claude/design-system.md §6:
 * `color: 'var(--chart-*)'`), the same pattern used throughout
 * web/components/tokens-chart.tsx. Sibling to data-table.tsx, the other
 * golden example.
 */

export interface DashboardCardPoint {
  label: string
  value: number
}

export interface DashboardMetricCardProps {
  title: string
  description?: string
  value: string
  /** Fractional change vs. the prior period, e.g. 0.12 for +12%. */
  deltaFraction?: number
  series: DashboardCardPoint[]
  /** Sanctioned JS-literal token reference, e.g. 'var(--chart-input)'. */
  seriesColor?: string
}

export const DashboardMetricCard = ({
  title,
  description,
  value,
  deltaFraction,
  series,
  seriesColor = 'var(--chart-input)',
}: DashboardMetricCardProps) => {
  const trendUp = deltaFraction !== undefined && deltaFraction >= 0

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div className="flex flex-col gap-1">
          <CardTitle>{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </div>
        {deltaFraction !== undefined && (
          <Badge
            className={cn(
              trendUp
                ? 'bg-status-good/10 text-status-good'
                : 'bg-status-critical/10 text-status-critical',
            )}
          >
            {trendUp ? '+' : '-'}
            {formatPercent(Math.abs(deltaFraction))}
          </Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="text-2xl font-semibold tracking-tight tabular-nums">{value}</div>
        <Sparkline series={series} color={seriesColor} />
      </CardContent>
    </Card>
  )
}

const SPARK_H = 40
const SPARK_PAD = 4

const Sparkline = ({ series, color }: { series: DashboardCardPoint[]; color: string }) => {
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

  const points = useMemo(() => {
    if (series.length === 0 || width === 0) return []
    const values = series.map((p) => p.value)
    const min = Math.min(...values)
    const max = Math.max(...values)
    const range = max - min || 1
    const innerW = width - SPARK_PAD * 2
    const innerH = SPARK_H - SPARK_PAD * 2
    return series.map((p, i) => ({
      x: SPARK_PAD + (series.length === 1 ? innerW / 2 : (i / (series.length - 1)) * innerW),
      y: SPARK_PAD + innerH - ((p.value - min) / range) * innerH,
    }))
  }, [series, width])

  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ')
  const last = points[points.length - 1]
  const lastLabel = series[series.length - 1]?.label ?? ''

  return (
    <div ref={containerRef} className="w-full">
      {width > 0 && points.length > 0 && (
        <svg
          width={width}
          height={SPARK_H}
          role="img"
          aria-label={`Trend across ${series.length} periods, ending at ${lastLabel}`}
        >
          <path
            d={path}
            fill="none"
            stroke={color}
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {last && <circle cx={last.x} cy={last.y} r="2" fill={color} />}
        </svg>
      )}
    </div>
  )
}
