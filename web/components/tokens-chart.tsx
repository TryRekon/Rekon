import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { DayBucket, RangeKey } from '../../shared/api-types'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Button } from './ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table'
import { formatCompact, formatInt, formatUtcDay } from '../lib/format'
import { cn } from '../lib/utils'
import { TOKEN_SERIES as SERIES, type TokenSeriesKey as SeriesKey } from '../lib/chart-series'

const DAY_MS = 86_400_000
const RANGE_DAYS: Record<Exclude<RangeKey, 'all'>, number> = { '7d': 7, '30d': 30, '90d': 90 }

const PLOT_TOP = 8
const PLOT_H = 240
const AXIS_H = 24
const MARGIN_LEFT = 48
const MARGIN_RIGHT = 8
const SEGMENT_GAP = 2

const emptyBucket = (day: string): DayBucket => ({
  day,
  requests: 0,
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheCreationTokens: 0,
  cost: null,
})

const utcDayString = (ms: number): string => new Date(ms).toISOString().slice(0, 10)

const fillDays = (byDay: DayBucket[], range: RangeKey, generatedAt: number): DayBucket[] => {
  const byKey = new Map(byDay.map((d) => [d.day, d]))
  const end = Date.parse(`${utcDayString(generatedAt)}T00:00:00Z`)
  const firstDay = byDay[0]
  const start =
    range === 'all'
      ? Date.parse(`${firstDay ? firstDay.day : utcDayString(generatedAt)}T00:00:00Z`)
      : end - RANGE_DAYS[range] * DAY_MS
  const out: DayBucket[] = []
  for (let t = start; t <= end; t += DAY_MS) {
    const key = utcDayString(t)
    out.push(byKey.get(key) ?? emptyBucket(key))
  }
  return out
}

const niceStep = (raw: number): number => {
  const pow = 10 ** Math.floor(Math.log10(Math.max(raw, 1)))
  const norm = raw / pow
  if (norm <= 1) return pow
  if (norm <= 2) return 2 * pow
  if (norm <= 2.5) return 2.5 * pow
  if (norm <= 5) return 5 * pow
  return 10 * pow
}

const roundedTopRect = (x: number, y: number, w: number, h: number, radius: number): string => {
  const r = Math.min(radius, h, w / 2)
  return [
    `M${x},${y + h}`,
    `L${x},${y + r}`,
    `Q${x},${y} ${x + r},${y}`,
    `L${x + w - r},${y}`,
    `Q${x + w},${y} ${x + w},${y + r}`,
    `L${x + w},${y + h}`,
    'Z',
  ].join(' ')
}

const dayTotal = (d: DayBucket): number =>
  d.inputTokens + d.outputTokens + d.cacheReadTokens + d.cacheCreationTokens

interface TokensChartCardProps {
  byDay: DayBucket[]
  range: RangeKey
  generatedAt: number
}

export const TokensChartCard = ({ byDay, range, generatedAt }: TokensChartCardProps) => {
  const [view, setView] = useState<'chart' | 'table'>('chart')
  const days = useMemo(() => fillDays(byDay, range, generatedAt), [byDay, range, generatedAt])
  const hasData = useMemo(() => days.some((d) => dayTotal(d) > 0), [days])

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div className="flex flex-col gap-1">
          <CardTitle>Tokens per day</CardTitle>
          <CardDescription>Stacked by token type, bucketed by UTC day</CardDescription>
        </div>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-pressed={view === 'chart'}
            title="Chart view"
            className={cn(view === 'chart' && 'bg-muted')}
            onClick={() => setView('chart')}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
              <path
                d="M2 12V8M7 12V3M12 12V6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-pressed={view === 'table'}
            title="Table view"
            className={cn(view === 'table' && 'bg-muted')}
            onClick={() => setView('table')}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
              <path
                d="M2 4.5h10M2 7h10M2 9.5h10"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-x-4 gap-y-1 pb-3">
          {SERIES.map((s) => (
            <span key={s.key} className="inline-flex items-center gap-1.5">
              <span
                className="h-2.5 w-2.5 rounded-[3px]"
                style={{ backgroundColor: s.color }}
                aria-hidden="true"
              />
              <span className="text-xs text-muted-foreground">{s.label}</span>
            </span>
          ))}
        </div>
        {!hasData ? (
          <div
            className="flex items-center justify-center text-sm text-muted-foreground"
            style={{ height: PLOT_TOP + PLOT_H + AXIS_H }}
          >
            No requests recorded in this range.
          </div>
        ) : view === 'chart' ? (
          <StackedColumns days={days} />
        ) : (
          <div className="max-h-80 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Day</TableHead>
                  {SERIES.map((s) => (
                    <TableHead key={s.key} className="text-right">
                      {s.label}
                    </TableHead>
                  ))}
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...days].reverse().map((d) => (
                  <TableRow key={d.day}>
                    <TableCell className="text-xs whitespace-nowrap">
                      {formatUtcDay(d.day, true)}
                    </TableCell>
                    {SERIES.map((s) => (
                      <TableCell key={s.key} className="text-right text-xs tabular-nums">
                        {formatInt(d[s.key])}
                      </TableCell>
                    ))}
                    <TableCell className="text-right text-xs font-medium tabular-nums">
                      {formatInt(dayTotal(d))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

const StackedColumns = ({ days }: { days: DayBucket[] }) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [hover, setHover] = useState<number | null>(null)

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

  const innerW = Math.max(0, width - MARGIN_LEFT - MARGIN_RIGHT)
  const baselineY = PLOT_TOP + PLOT_H
  const maxTotal = Math.max(...days.map(dayTotal), 1)
  const step = niceStep(maxTotal / 4)
  const yMax = step * 4
  const ticks = [0, step, step * 2, step * 3, step * 4]
  const yFor = (v: number): number => baselineY - (v / yMax) * PLOT_H

  const band = days.length > 0 ? innerW / days.length : 0
  const barW = Math.min(24, Math.max(1, band - 2))
  const labelStride = Math.max(1, Math.ceil(days.length / Math.max(2, Math.floor(innerW / 56))))

  const hovered = hover !== null ? days[hover] : undefined
  const hoveredX = hover !== null ? MARGIN_LEFT + hover * band + band / 2 : 0

  return (
    <div ref={containerRef} className="relative" onPointerLeave={() => setHover(null)}>
      {width > 0 && (
        <svg
          width={width}
          height={PLOT_TOP + PLOT_H + AXIS_H}
          role="img"
          aria-label="Stacked column chart of tokens per day"
        >
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={MARGIN_LEFT}
                x2={width - MARGIN_RIGHT}
                y1={yFor(t)}
                y2={yFor(t)}
                stroke={t === 0 ? 'var(--axis)' : 'var(--gridline)'}
                strokeWidth="1"
              />
              <text
                x={MARGIN_LEFT - 8}
                y={yFor(t) + 3}
                textAnchor="end"
                className="fill-muted-foreground tabular-nums"
                fontSize="10"
              >
                {formatCompact(t)}
              </text>
            </g>
          ))}
          {hover !== null && (
            <rect
              x={MARGIN_LEFT + hover * band}
              y={PLOT_TOP}
              width={band}
              height={PLOT_H}
              fill="var(--accent)"
              opacity="0.5"
            />
          )}
          {days.map((d, i) => {
            const x = MARGIN_LEFT + i * band + (band - barW) / 2
            const stacked: { key: SeriesKey; color: string; y: number; h: number }[] = []
            let cumulative = 0
            for (const s of SERIES) {
              const v = d[s.key]
              if (v <= 0) continue
              const top = yFor(cumulative + v)
              const bottom = yFor(cumulative)
              stacked.push({ key: s.key, color: s.color, y: top, h: bottom - top })
              cumulative += v
            }
            return (
              <g key={d.day} style={hover === i ? { filter: 'brightness(1.12)' } : undefined}>
                {stacked.map((seg, idx) => {
                  const isTop = idx === stacked.length - 1
                  const hasFillBelow = idx > 0
                  const h = seg.h - (hasFillBelow ? SEGMENT_GAP : 0)
                  if (h < 0.5) return null
                  const y = seg.y
                  return isTop ? (
                    <path key={seg.key} d={roundedTopRect(x, y, barW, h, 4)} fill={seg.color} />
                  ) : (
                    <rect key={seg.key} x={x} y={y} width={barW} height={h} fill={seg.color} />
                  )
                })}
              </g>
            )
          })}
          {days.map((d, i) =>
            i % labelStride === 0 ? (
              <text
                key={d.day}
                x={MARGIN_LEFT + i * band + band / 2}
                y={baselineY + 16}
                textAnchor="middle"
                className="fill-muted-foreground"
                fontSize="10"
              >
                {formatUtcDay(d.day)}
              </text>
            ) : null,
          )}
          {days.map((d, i) => (
            <rect
              key={d.day}
              x={MARGIN_LEFT + i * band}
              y={PLOT_TOP}
              width={band}
              height={PLOT_H}
              fill="transparent"
              tabIndex={0}
              className="outline-none"
              aria-label={`${formatUtcDay(d.day, true)}: ${SERIES.map((s) => `${s.label} ${formatInt(d[s.key])}`).join(', ')}`}
              onPointerEnter={() => setHover(i)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
            />
          ))}
        </svg>
      )}
      {hovered && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-md border bg-card px-3 py-2 shadow-md"
          style={{
            left: Math.min(Math.max(hoveredX, 110), Math.max(width - 110, 110)),
            top: Math.max(yFor(dayTotal(hovered)) - 8, 70),
          }}
        >
          <div className="pb-1 text-xs font-medium whitespace-nowrap">
            {formatUtcDay(hovered.day, true)}
          </div>
          {SERIES.map((s) => (
            <div key={s.key} className="flex items-center gap-2 py-0.5 whitespace-nowrap">
              <span
                className="h-[3px] w-2.5 rounded-full"
                style={{ backgroundColor: s.color }}
                aria-hidden="true"
              />
              <span className="text-xs text-muted-foreground">{s.label}</span>
              <span className="ml-auto pl-4 text-xs font-medium tabular-nums">
                {formatInt(hovered[s.key])}
              </span>
            </div>
          ))}
          <div className="mt-1 flex items-center gap-2 border-t pt-1 whitespace-nowrap">
            <span className="text-xs text-muted-foreground">Total</span>
            <span className="ml-auto pl-4 text-xs font-semibold tabular-nums">
              {formatInt(dayTotal(hovered))}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
