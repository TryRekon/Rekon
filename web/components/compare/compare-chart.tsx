import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { SessionDetail, SessionTurn } from '../../../shared/api-types'
import type { Divergence } from '../../lib/compare'
import { cumulative, newInputPerTurn } from '../../lib/compare'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { RunLegend } from './scorecard'
import { formatCompact, formatInt } from '../../lib/format'

const PLOT_TOP = 10
const PLOT_H = 220
const AXIS_H = 22
const MARGIN_LEFT = 48
const MARGIN_RIGHT = 76
const MARKERS_PER_RUN = 2

const niceStep = (raw: number): number => {
  const pow = 10 ** Math.floor(Math.log10(Math.max(raw, 1)))
  const norm = raw / pow
  if (norm <= 1) return pow
  if (norm <= 2) return 2 * pow
  if (norm <= 2.5) return 2.5 * pow
  if (norm <= 5) return 5 * pow
  return 10 * pow
}

interface RunSeries {
  turns: SessionTurn[]
  perTurn: number[]
  cumulative: number[]
  color: string
  label: 'A' | 'B'
}

// Indices (0-based) of the largest single-turn jumps, skipping the root turn
// whose "jump" is just the initial prompt.
const largestJumps = (perTurn: number[]): Set<number> =>
  new Set(
    perTurn
      .map((v, i) => ({ v, i }))
      .slice(1)
      .sort((x, y) => y.v - x.v)
      .slice(0, MARKERS_PER_RUN)
      .filter(({ v }) => v > 0)
      .map(({ i }) => i),
  )

const topToolResults = (turn: SessionTurn): string[] =>
  [...turn.toolCalls]
    .filter((c) => (c.outputTokens ?? 0) > 0)
    .sort((x, y) => (y.outputTokens ?? 0) - (x.outputTokens ?? 0))
    .slice(0, 2)
    .map((c) => `${c.func} ~${formatCompact(c.outputTokens ?? 0)}`)

interface CompareChartProps {
  a: SessionDetail
  b: SessionDetail
  divergence: Divergence | null
  onSelectTurn: (index: number) => void
}

export const CompareChartCard = ({ a, b, divergence, onSelectTurn }: CompareChartProps) => {
  const truncated = a.turnsTruncated || b.turnsTruncated
  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-baseline justify-between gap-2">
        <div className="flex flex-col gap-1">
          <CardTitle>Where the difference happened</CardTitle>
          <CardDescription>
            Cumulative new input tokens by turn · dots mark the largest jumps · hover for each
            turn's breakdown
            {truncated && ' · long session — showing the most recent recorded turns only'}
          </CardDescription>
        </div>
        <RunLegend aLabel="Run A" bLabel="Run B" />
      </CardHeader>
      <CardContent>
        {a.turns.length < 2 && b.turns.length < 2 ? (
          <div
            className="flex items-center justify-center text-sm text-muted-foreground"
            style={{ height: PLOT_TOP + PLOT_H + AXIS_H }}
          >
            Not enough turns to chart.
          </div>
        ) : (
          <CumulativeLines a={a} b={b} divergence={divergence} onSelectTurn={onSelectTurn} />
        )}
      </CardContent>
    </Card>
  )
}

const CumulativeLines = ({ a, b, divergence, onSelectTurn }: CompareChartProps) => {
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

  const series: RunSeries[] = useMemo(() => {
    const build = (detail: SessionDetail, color: string, label: 'A' | 'B'): RunSeries => {
      const perTurn = newInputPerTurn(detail.turns)
      return { turns: detail.turns, perTurn, cumulative: cumulative(perTurn), color, label }
    }
    return [build(a, 'var(--run-a)', 'A'), build(b, 'var(--run-b)', 'B')]
  }, [a, b])

  const markers = useMemo(() => series.map((s) => largestJumps(s.perTurn)), [series])

  const maxTurns = Math.max(...series.map((s) => s.turns.length))
  const innerW = Math.max(0, width - MARGIN_LEFT - MARGIN_RIGHT)
  const baselineY = PLOT_TOP + PLOT_H
  const maxValue = Math.max(...series.flatMap((s) => s.cumulative), 1)
  const step = niceStep(maxValue / 4)
  const yMax = step * 4
  const ticks = [0, step, step * 2, step * 3, step * 4]
  const xFor = (i: number): number =>
    MARGIN_LEFT + (maxTurns > 1 ? (i / (maxTurns - 1)) * innerW : 0)
  const yFor = (v: number): number => baselineY - (v / yMax) * PLOT_H
  const labelStride = Math.max(1, Math.ceil(maxTurns / Math.max(2, Math.floor(innerW / 48))))

  const pathFor = (s: RunSeries): string =>
    s.cumulative.map((v, i) => `${i === 0 ? 'M' : 'L'}${xFor(i).toFixed(1)} ${yFor(v).toFixed(1)}`).join(' ')

  // Direct end-of-line labels, nudged apart when near-identical runs would
  // print them on top of each other.
  const endLabels = series
    .filter((s) => s.cumulative.length > 0)
    .map((s) => {
      const last = s.cumulative[s.cumulative.length - 1] ?? 0
      return {
        series: s,
        x: xFor(s.cumulative.length - 1),
        y: yFor(last),
        labelY: yFor(last) + 3.5,
        value: last,
      }
    })
  if (endLabels.length === 2) {
    const [first, second] = endLabels as [
      (typeof endLabels)[number],
      (typeof endLabels)[number],
    ]
    if (Math.abs(first.x - second.x) < 40 && Math.abs(first.y - second.y) < 14) {
      const upper = first.y <= second.y ? first : second
      const lower = upper === first ? second : first
      const mid = (first.y + second.y) / 2
      upper.labelY = mid - 4
      lower.labelY = mid + 12
    }
  }

  const hoveredX = hover !== null ? xFor(hover) : 0

  return (
    <div ref={containerRef} className="relative" onPointerLeave={() => setHover(null)}>
      {width > 0 && (
        <svg
          width={width}
          height={PLOT_TOP + PLOT_H + AXIS_H}
          role="img"
          aria-label="Cumulative new input tokens by turn for both runs"
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

          {divergence && divergence.index <= maxTurns && (
            <g>
              <line
                x1={xFor(divergence.index - 1)}
                x2={xFor(divergence.index - 1)}
                y1={PLOT_TOP}
                y2={baselineY}
                stroke="var(--axis)"
                strokeWidth="1"
                strokeDasharray="3 4"
              />
              <text
                x={xFor(divergence.index - 1) + 6}
                y={PLOT_TOP + 10}
                className="fill-muted-foreground"
                fontSize="10"
              >
                {divergence.kind === 'prompt' ? 'prompts' : 'behavior'} diverge · turn{' '}
                {divergence.index}
              </text>
            </g>
          )}

          {hover !== null && (
            <line
              x1={hoveredX}
              x2={hoveredX}
              y1={PLOT_TOP}
              y2={baselineY}
              stroke="var(--axis)"
              strokeWidth="1"
            />
          )}

          {series.map((s, si) => (
            <g key={s.label}>
              <path d={pathFor(s)} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" />
              {[...(markers[si] ?? [])].map((i) => (
                <circle
                  key={i}
                  cx={xFor(i)}
                  cy={yFor(s.cumulative[i] ?? 0)}
                  r="4"
                  fill={s.color}
                  stroke="var(--card)"
                  strokeWidth="2"
                />
              ))}
            </g>
          ))}

          {endLabels.map((end) => (
            <g key={end.series.label}>
              <circle cx={end.x} cy={end.y} r="3" fill={end.series.color} />
              <text
                x={end.x + 8}
                y={end.labelY}
                fontSize="11"
                fontWeight="600"
                fill={end.series.color}
                className="tabular-nums"
              >
                {end.series.label} · {formatCompact(end.value)}
              </text>
            </g>
          ))}

          {Array.from({ length: maxTurns }, (_, i) =>
            i % labelStride === 0 ? (
              <text
                key={i}
                x={xFor(i)}
                y={baselineY + 15}
                textAnchor="middle"
                className="fill-muted-foreground tabular-nums"
                fontSize="10"
              >
                {i + 1}
              </text>
            ) : null,
          )}

          {Array.from({ length: maxTurns }, (_, i) => (
            <rect
              key={i}
              x={MARGIN_LEFT + (maxTurns > 1 ? (i - 0.5) * (innerW / (maxTurns - 1)) : 0)}
              y={PLOT_TOP}
              width={maxTurns > 1 ? innerW / (maxTurns - 1) : innerW}
              height={PLOT_H}
              fill="transparent"
              tabIndex={0}
              className="cursor-pointer outline-none"
              aria-label={`Turn ${i + 1}`}
              onPointerEnter={() => setHover(i)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              onClick={() => onSelectTurn(i + 1)}
            />
          ))}
        </svg>
      )}

      {hover !== null && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-md border bg-card px-3 py-2 shadow-md"
          style={{
            left: Math.min(Math.max(hoveredX, 130), Math.max(width - 130, 130)),
            top: Math.max(
              Math.min(...series.map((s) => yFor(s.cumulative[hover] ?? s.cumulative[s.cumulative.length - 1] ?? 0))) - 8,
              82,
            ),
          }}
        >
          <div className="pb-1 text-xs font-medium whitespace-nowrap">Turn {hover + 1}</div>
          {series.map((s) => {
            if (hover >= s.turns.length) return null
            const turn = s.turns[hover]!
            const tools = topToolResults(turn)
            return (
              <div key={s.label} className="py-0.5">
                <div className="flex items-center gap-2 whitespace-nowrap">
                  <span
                    className="h-[3px] w-2.5 rounded-full"
                    style={{ backgroundColor: s.color }}
                    aria-hidden="true"
                  />
                  <span className="text-xs text-muted-foreground">Run {s.label}</span>
                  <span className="ml-auto pl-4 text-xs font-medium tabular-nums">
                    {(s.perTurn[hover] ?? 0) >= 0 ? '+' : '−'}
                    {formatInt(Math.abs(s.perTurn[hover] ?? 0))}
                  </span>
                </div>
                {tools.length > 0 && (
                  <div className="pl-[18px] font-mono text-[10px] text-muted-foreground whitespace-nowrap">
                    {tools.join(' · ')}
                  </div>
                )}
              </div>
            )
          })}
          <div className="mt-1 border-t pt-1 text-[10px] text-muted-foreground whitespace-nowrap">
            Click to jump to this turn
          </div>
        </div>
      )}
    </div>
  )
}
