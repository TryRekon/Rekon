import { useLayoutEffect, useRef, useState } from 'react'
import type { SessionTurn } from '../../shared/api-types'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { formatCompact, formatInt } from '../lib/format'

const SERIES = [
  { key: 'cacheReadTokens', label: 'Cache read', color: 'var(--chart-cache-read)' },
  { key: 'cacheCreationTokens', label: 'Cache write', color: 'var(--chart-cache-write)' },
  { key: 'inputTokens', label: 'Uncached input', color: 'var(--chart-input)' },
  { key: 'outputTokens', label: 'Output', color: 'var(--chart-output)' },
] as const

type SeriesKey = (typeof SERIES)[number]['key']

const PLOT_TOP = 8
const PLOT_H = 180
const AXIS_H = 22
const MARGIN_LEFT = 48
const MARGIN_RIGHT = 8

const value = (turn: SessionTurn, key: SeriesKey): number => turn[key] ?? 0
const turnTotal = (turn: SessionTurn): number =>
  SERIES.reduce((sum, s) => sum + value(turn, s.key), 0)

const niceStep = (raw: number): number => {
  const pow = 10 ** Math.floor(Math.log10(Math.max(raw, 1)))
  const norm = raw / pow
  if (norm <= 1) return pow
  if (norm <= 2) return 2 * pow
  if (norm <= 2.5) return 2.5 * pow
  if (norm <= 5) return 5 * pow
  return 10 * pow
}

export const ContextChartCard = ({ turns }: { turns: SessionTurn[] }) => (
  <Card>
    <CardHeader>
      <CardTitle>Context per turn</CardTitle>
      <CardDescription>
        Prompt composition of every request, in order — cache reads are the surviving context,
        writes and uncached input are what each turn paid full-ish rate for
      </CardDescription>
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
      {turns.length === 0 ? (
        <div
          className="flex items-center justify-center text-sm text-muted-foreground"
          style={{ height: PLOT_TOP + PLOT_H + AXIS_H }}
        >
          No requests recorded.
        </div>
      ) : (
        <TurnColumns turns={turns} />
      )}
    </CardContent>
  </Card>
)

const TurnColumns = ({ turns }: { turns: SessionTurn[] }) => {
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
  const maxTotal = Math.max(...turns.map(turnTotal), 1)
  const step = niceStep(maxTotal / 4)
  const yMax = step * 4
  const ticks = [0, step, step * 2, step * 3, step * 4]
  const yFor = (v: number): number => baselineY - (v / yMax) * PLOT_H

  const band = turns.length > 0 ? innerW / turns.length : 0
  const barW = Math.min(20, Math.max(1, band - 1))
  const labelStride = Math.max(1, Math.ceil(turns.length / Math.max(2, Math.floor(innerW / 48))))

  const hovered = hover !== null ? turns[hover] : undefined
  const hoveredX = hover !== null ? MARGIN_LEFT + hover * band + band / 2 : 0

  const scrollToTurn = (id: number) => {
    document.getElementById(`turn-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  return (
    <div ref={containerRef} className="relative" onPointerLeave={() => setHover(null)}>
      {width > 0 && (
        <svg
          width={width}
          height={PLOT_TOP + PLOT_H + AXIS_H}
          role="img"
          aria-label="Stacked column chart of token composition per turn"
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
          {turns.map((turn, i) => {
            const x = MARGIN_LEFT + i * band + (band - barW) / 2
            let cumulative = 0
            return (
              <g key={turn.id} style={hover === i ? { filter: 'brightness(1.12)' } : undefined}>
                {SERIES.map((s) => {
                  const v = value(turn, s.key)
                  if (v <= 0) return null
                  const top = yFor(cumulative + v)
                  const bottom = yFor(cumulative)
                  cumulative += v
                  const h = bottom - top
                  if (h < 0.5) return null
                  return <rect key={s.key} x={x} y={top} width={barW} height={h} fill={s.color} />
                })}
              </g>
            )
          })}
          {turns.map((turn, i) =>
            i % labelStride === 0 ? (
              <text
                key={turn.id}
                x={MARGIN_LEFT + i * band + band / 2}
                y={baselineY + 15}
                textAnchor="middle"
                className="fill-muted-foreground tabular-nums"
                fontSize="10"
              >
                {i + 1}
              </text>
            ) : null,
          )}
          {turns.map((turn, i) => (
            <rect
              key={turn.id}
              x={MARGIN_LEFT + i * band}
              y={PLOT_TOP}
              width={band}
              height={PLOT_H}
              fill="transparent"
              tabIndex={0}
              className="cursor-pointer outline-none"
              aria-label={`Turn ${i + 1}: ${SERIES.map((s) => `${s.label} ${formatInt(value(turn, s.key))}`).join(', ')}`}
              onPointerEnter={() => setHover(i)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              onClick={() => scrollToTurn(turn.id)}
            />
          ))}
        </svg>
      )}
      {hovered && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-md border bg-card px-3 py-2 shadow-md"
          style={{
            left: Math.min(Math.max(hoveredX, 110), Math.max(width - 110, 110)),
            top: Math.max(yFor(turnTotal(hovered)) - 8, 70),
          }}
        >
          <div className="pb-1 text-xs font-medium whitespace-nowrap">
            Turn {(hover ?? 0) + 1} · {hovered.model ?? 'unknown'}
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
                {formatInt(value(hovered, s.key))}
              </span>
            </div>
          ))}
          <div className="mt-1 flex items-center gap-2 border-t pt-1 whitespace-nowrap">
            <span className="text-xs text-muted-foreground">Total</span>
            <span className="ml-auto pl-4 text-xs font-semibold tabular-nums">
              {formatInt(turnTotal(hovered))}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
