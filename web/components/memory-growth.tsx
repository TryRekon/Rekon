import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { SessionToolDef, SessionTurn } from '../../shared/api-types'
import {
  computeMemoryGrowth,
  SOURCE_LABELS,
  SOURCE_ORDER,
  type GrowthEvent,
  type GrowthPoint,
  type MemorySource,
} from '../lib/memory'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { formatCompact, formatInt, formatPercent } from '../lib/format'

// Memory-profiler view: a stacked area of the context window across turns,
// banded by content source, next to a ranked list of the growth events that
// caused it. Hovering an event highlights its turn in the chart; clicking
// jumps to the turn in the session timeline where the content is visible.
// Band hues are stacked in an order validated for CVD separation; identity
// is carried by the legend, tooltip, and event swatches, never color alone.

const PLOT_TOP = 8
const PLOT_H = 200
const AXIS_H = 22
const MARGIN_LEFT = 48
const MARGIN_RIGHT = 8

const HUES: Record<MemorySource, string> = {
  base: 'var(--flame-neutral)',
  defs: 'var(--flame-defs)',
  results: 'var(--flame-results)',
  user: 'var(--flame-user)',
  assistant: 'var(--flame-assistant)',
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

const scrollToTurn = (id: number) => {
  document.getElementById(`turn-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

interface MemoryGrowthCardProps {
  turns: SessionTurn[]
  toolset: SessionToolDef[] | null
}

export const MemoryGrowthCard = ({ turns, toolset }: MemoryGrowthCardProps) => {
  const growth = useMemo(() => computeMemoryGrowth(turns, toolset), [turns, toolset])

  return (
    <Card>
      <CardHeader>
        <CardTitle>Context memory</CardTitle>
        <CardDescription>
          {growth
            ? `How the context window grew to ${formatCompact(growth.contextTokens)} tokens, split by source — the top growth events trace what caused each jump. Click one to jump to its turn.`
            : 'How the context window grew, split by source'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {growth === null ? (
          <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
            No token usage recorded for this session yet.
          </div>
        ) : (
          <div className="flex flex-col gap-4 lg:flex-row">
            <GrowthChart growth={growth} />
            <EventsPanel growth={growth} />
          </div>
        )}
      </CardContent>
    </Card>
  )
}

type Growth = NonNullable<ReturnType<typeof computeMemoryGrowth>>

const GrowthChart = ({ growth }: { growth: Growth }) => {
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

  const { points } = growth
  const innerW = Math.max(0, width - MARGIN_LEFT - MARGIN_RIGHT)
  const baselineY = PLOT_TOP + PLOT_H
  const maxTokens = Math.max(...points.map((p) => p.promptTokens), 1)
  const step = niceStep(maxTokens / 4)
  const yMax = step * 4
  const ticks = [0, step, step * 2, step * 3, step * 4]
  const yFor = (v: number): number => baselineY - (v / yMax) * PLOT_H
  const xFor = (i: number): number =>
    points.length === 1 ? MARGIN_LEFT + innerW / 2 : MARGIN_LEFT + (i / (points.length - 1)) * innerW

  // Cumulative band boundaries per point, bottom to top.
  const stacks = useMemo(() => {
    return points.map((p) => {
      let cumulative = 0
      const bounds: Record<MemorySource, { from: number; to: number }> = {} as never
      for (const source of SOURCE_ORDER) {
        bounds[source] = { from: cumulative, to: cumulative + p.bands[source] }
        cumulative += p.bands[source]
      }
      return bounds
    })
  }, [points])

  const topPoints = (source: MemorySource): string[] =>
    points.length === 1
      ? [
          `${MARGIN_LEFT} ${yFor(stacks[0]?.[source]?.to ?? 0)}`,
          `${MARGIN_LEFT + innerW} ${yFor(stacks[0]?.[source]?.to ?? 0)}`,
        ]
      : points.map((_, i) => `${xFor(i)} ${yFor(stacks[i]?.[source]?.to ?? 0)}`)

  const bandPath = (source: MemorySource): string => {
    if (points.length === 1) {
      const b = stacks[0]?.[source]
      if (!b) return ''
      const x0 = MARGIN_LEFT
      const x1 = MARGIN_LEFT + innerW
      return `M ${x0} ${yFor(b.to)} L ${x1} ${yFor(b.to)} L ${x1} ${yFor(b.from)} L ${x0} ${yFor(b.from)} Z`
    }
    const bottom = points
      .map((_, i) => `${xFor(i)} ${yFor(stacks[i]?.[source]?.from ?? 0)}`)
      .reverse()
    return `M ${topPoints(source).join(' L ')} L ${bottom.join(' L ')} Z`
  }

  // Bands that never carry tokens add nothing to the plot or the legend, and
  // a band that never reaches visible thickness must not draw its boundary
  // line — a sliver's edge would overpaint the band below it in the wrong hue.
  const activeSources = SOURCE_ORDER.filter((s) => points.some((p) => p.bands[s] > 0.5))
  const edgeSources = activeSources.filter((s) =>
    points.some((p) => (p.bands[s] / yMax) * PLOT_H >= 1.5),
  )

  const band = points.length > 1 ? innerW / (points.length - 1) : innerW
  const hovered = hover !== null ? points[hover] : undefined
  const hoveredPrev = hover !== null && hover > 0 ? points[hover - 1] : undefined

  const labelStride = Math.max(1, Math.ceil(points.length / Math.max(2, Math.floor(innerW / 48))))

  return (
    <div ref={containerRef} className="relative min-w-0 flex-1" onPointerLeave={() => setHover(null)}>
      <div className="flex flex-wrap gap-x-4 gap-y-1 pb-3">
        {activeSources.map((source) => (
          <span key={source} className="inline-flex items-center gap-1.5">
            <span
              className="h-2.5 w-2.5 rounded-[3px]"
              style={{ backgroundColor: HUES[source] }}
              aria-hidden="true"
            />
            <span className="text-xs text-muted-foreground">{SOURCE_LABELS[source]}</span>
          </span>
        ))}
      </div>
      {width > 0 && (
        <svg
          width={width}
          height={PLOT_TOP + PLOT_H + AXIS_H}
          role="img"
          aria-label="Stacked area chart of context window size per turn, split by content source"
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
          {activeSources.map((source) => (
            <path
              key={source}
              d={bandPath(source)}
              fill={`color-mix(in oklab, ${HUES[source]} 30%, var(--card))`}
            />
          ))}
          {edgeSources.map((source) => (
            <path
              key={`${source}-edge`}
              d={`M ${topPoints(source).join(' L ')}`}
              fill="none"
              stroke={HUES[source]}
              strokeWidth="2"
              strokeLinejoin="round"
            />
          ))}
          {points.map((p, i) =>
            p.compaction ? (
              <g key={p.turnId}>
                <line
                  x1={xFor(i)}
                  x2={xFor(i)}
                  y1={PLOT_TOP}
                  y2={baselineY}
                  stroke="var(--status-serious)"
                  strokeWidth="1"
                  strokeDasharray="3 3"
                />
                <text
                  x={xFor(i)}
                  y={PLOT_TOP + 8}
                  textAnchor="middle"
                  fontSize="9"
                  className="fill-muted-foreground"
                >
                  compaction
                </text>
              </g>
            ) : null,
          )}
          {hover !== null && hovered && (
            <line
              x1={xFor(hover)}
              x2={xFor(hover)}
              y1={PLOT_TOP}
              y2={baselineY}
              stroke="var(--axis)"
              strokeWidth="1"
            />
          )}
          {points.map((p, i) =>
            i % labelStride === 0 ? (
              <text
                key={p.turnId}
                x={xFor(i)}
                y={baselineY + 15}
                textAnchor="middle"
                className="fill-muted-foreground tabular-nums"
                fontSize="10"
              >
                {p.turnNumber}
              </text>
            ) : null,
          )}
          {points.map((p, i) => (
            <rect
              key={p.turnId}
              x={xFor(i) - band / 2}
              y={PLOT_TOP}
              width={band}
              height={PLOT_H}
              fill="transparent"
              tabIndex={0}
              className="cursor-pointer outline-none"
              aria-label={`Turn ${p.turnNumber}: context ${formatInt(Math.round(p.promptTokens))} tokens — ${SOURCE_ORDER.map(
                (s) => `${SOURCE_LABELS[s]} ${formatCompact(p.bands[s])}`,
              ).join(', ')}`}
              onPointerEnter={() => setHover(i)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              onClick={() => scrollToTurn(p.turnId)}
            />
          ))}
        </svg>
      )}
      {hovered && (
        <ChartTooltip
          point={hovered}
          prev={hoveredPrev}
          x={Math.min(Math.max(xFor(hover ?? 0), 110), Math.max(width - 110, 110))}
          y={yFor(hovered.promptTokens)}
        />
      )}
      {growth.estimated && (
        <p className="pt-2 text-xs text-muted-foreground">
          Band splits are estimates, scaled to the provider-reported context size per turn.
        </p>
      )}
      {growth.truncatedBase && (
        <p className="pt-1 text-xs text-muted-foreground">
          Earlier turns fell outside the recorded window; their contribution is part of the base
          band.
        </p>
      )}
    </div>
  )
}

const ChartTooltip = ({
  point,
  prev,
  x,
  y,
}: {
  point: GrowthPoint
  prev: GrowthPoint | undefined
  x: number
  y: number
}) => {
  const delta = prev ? point.promptTokens - prev.promptTokens : null
  return (
    <div
      className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-md border bg-card px-3 py-2 shadow-md"
      style={{ left: x, top: Math.max(y + 24, 76) }}
    >
      <div className="pb-1 text-xs font-medium whitespace-nowrap">
        Turn {point.turnNumber} · {formatInt(Math.round(point.promptTokens))} tokens
        {delta !== null && (
          <span className="text-muted-foreground">
            {' '}
            ({delta >= 0 ? '+' : '−'}
            {formatCompact(Math.abs(delta))})
          </span>
        )}
      </div>
      {[...SOURCE_ORDER].reverse().map((source) =>
        point.bands[source] > 0 ? (
          <div key={source} className="flex items-center gap-2 py-0.5 whitespace-nowrap">
            <span
              className="h-[3px] w-2.5 rounded-full"
              style={{ backgroundColor: HUES[source] }}
              aria-hidden="true"
            />
            <span className="text-xs text-muted-foreground">{SOURCE_LABELS[source]}</span>
            <span className="ml-auto pl-4 text-xs font-medium tabular-nums">
              {formatCompact(point.bands[source])}
            </span>
          </div>
        ) : null,
      )}
    </div>
  )
}

const EventsPanel = ({ growth }: { growth: Growth }) => (
  <div className="w-full shrink-0 lg:w-80">
    <p className="pb-1 text-xs font-medium text-muted-foreground">Top growth events</p>
    <div className="space-y-0.5">
      {growth.events.map((event) => (
        <EventRow key={event.key} event={event} contextTokens={growth.contextTokens} />
      ))}
    </div>
  </div>
)

const EventRow = ({ event, contextTokens }: { event: GrowthEvent; contextTokens: number }) => {
  const compaction = event.source === 'compaction'
  return (
    <button
      type="button"
      className="flex w-full items-start gap-2 rounded-md px-1.5 py-1 text-left outline-none hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring"
      onClick={() => scrollToTurn(event.anchorTurnId)}
      aria-label={`${event.label}, ${compaction ? '' : '+'}${formatInt(Math.round(event.tokens))} tokens at turn ${event.turnNumber} — jump to turn`}
    >
      <span
        className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-[3px]"
        style={{
          backgroundColor:
            event.source === 'compaction' ? 'var(--status-serious)' : HUES[event.source],
        }}
        aria-hidden="true"
      />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span
            className={`shrink-0 text-xs font-semibold tabular-nums ${compaction ? 'text-status-serious' : ''}`}
          >
            {compaction ? '−' : '+'}
            {formatCompact(Math.abs(event.tokens))}
          </span>
          <span className={`min-w-0 flex-1 truncate text-xs ${event.mono ? 'font-mono' : ''}`}>
            {event.label}
          </span>
          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
            turn {event.turnNumber} · {formatPercent(Math.abs(event.tokens) / contextTokens)}
          </span>
        </span>
        {event.preview && (
          <span className="block truncate font-mono text-[11px] text-muted-foreground">
            {event.preview}
          </span>
        )}
      </span>
    </button>
  )
}
