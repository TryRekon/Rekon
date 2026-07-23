import { useMemo, useState } from 'react'
import type { SessionTurn, ToolBucket } from '../../shared/api-types'
import { estimateCostUsd } from '../../shared/pricing'
import { ApiError } from '../lib/api'
import { useSession } from '../lib/queries'
import { useRouter } from '../lib/router'
import { computeCacheInsights } from '../lib/insights'
import { formatCompact, formatDuration, formatInt, formatPercent, formatTimestamp, formatUsd } from '../lib/format'
import { cn } from '../lib/utils'
import { Link } from '../lib/router'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { SessionEditDialog } from '../components/session-edit-dialog'
import {
  DetailHeader,
  FootLine,
  GlanceStrip,
  MetaItem,
  Region,
  StatusPill,
  Surface,
  Unit,
  entLink,
} from '../components/detail-surface'

const ACTIVE_WINDOW_MS = 5 * 60_000

const promptTokens = (t: SessionTurn) =>
  (t.inputTokens ?? 0) + (t.cacheReadTokens ?? 0) + (t.cacheCreationTokens ?? 0)

// The four per-turn token components, in the artifact's row order, each with a
// stable chart-color token.
const TOKEN_ROWS = [
  { key: 'inputTokens', label: 'Input', color: 'var(--chart-input)' },
  { key: 'outputTokens', label: 'Output', color: 'var(--chart-output)' },
  { key: 'cacheReadTokens', label: 'Cache read', color: 'var(--chart-cache-read)' },
  { key: 'cacheCreationTokens', label: 'Cache write', color: 'var(--chart-cache-write)' },
] as const

// ── Fork tree ────────────────────────────────────────────────────────────────

interface TreeRow {
  turn: SessionTurn
  index: number // 1-based position in the recorded order
  depth: number // 0 = mainline; each fork branch is one level deeper
  isFork: boolean // a non-first child of its parent
}

// Flatten the request tree (linked by parentRequestId) into render rows. The
// first child of any turn continues the mainline at the same depth; every other
// child opens a fork one level deeper — so a purely linear session stays flat
// and only real branches indent.
const layoutTree = (turns: SessionTurn[]): TreeRow[] => {
  const indexOf = new Map(turns.map((t, i) => [t.id, i + 1]))
  const children = new Map<number | null, SessionTurn[]>()
  const present = new Set(turns.map((t) => t.id))
  for (const t of turns) {
    // A parent recorded outside this (possibly truncated) window is treated as a
    // root so no turn is dropped.
    const key = t.parentRequestId !== null && present.has(t.parentRequestId) ? t.parentRequestId : null
    const list = children.get(key)
    if (list) list.push(t)
    else children.set(key, [t])
  }
  for (const list of children.values()) list.sort((a, b) => a.createdAt - b.createdAt)

  const rows: TreeRow[] = []
  const emitted = new Set<number>()
  const walk = (parentKey: number | null, depth: number) => {
    const kids = children.get(parentKey) ?? []
    kids.forEach((turn, i) => {
      // Guard against a parent cycle or a duplicate id re-walking a subtree.
      if (emitted.has(turn.id)) return
      emitted.add(turn.id)
      const forked = i > 0
      rows.push({ turn, index: indexOf.get(turn.id) ?? 0, depth: forked ? depth + 1 : depth, isFork: forked })
      walk(turn.id, forked ? depth + 1 : depth)
    })
  }
  walk(null, 0)
  // Any turn not reached from a root (only possible under a parent cycle among
  // present turns) is surfaced as its own root so no recorded turn is dropped.
  for (const t of turns) {
    if (emitted.has(t.id)) continue
    emitted.add(t.id)
    rows.push({ turn: t, index: indexOf.get(t.id) ?? 0, depth: 0, isFork: false })
    walk(t.id, 0)
  }
  return rows
}

const forkCount = (turns: SessionTurn[]): number => {
  const present = new Set(turns.map((t) => t.id))
  const counts = new Map<number, number>()
  for (const t of turns) {
    if (t.parentRequestId !== null && present.has(t.parentRequestId)) {
      counts.set(t.parentRequestId, (counts.get(t.parentRequestId) ?? 0) + 1)
    }
  }
  let forks = 0
  for (const n of counts.values()) if (n > 1) forks += n - 1
  return forks
}

const SessionTree = ({
  rows,
  selectedId,
  onSelect,
  truncated,
}: {
  rows: TreeRow[]
  selectedId: number
  onSelect: (id: number) => void
  truncated: boolean
}) => (
  <Region className="min-w-0 md:border-r md:border-b-0">
    <div className="flex items-baseline justify-between border-b border-border px-5 py-3">
      <span className="text-[12px] font-semibold text-foreground">Conversation tree</span>
      <span className="flex gap-3 text-[11px] text-secondary-ink">
        <LegendDot color="var(--flame-assistant)" label="assistant" />
        <LegendDot color="var(--flame-results)" label="tool" />
      </span>
    </div>
    <div className="max-h-[560px] overflow-y-auto px-2 py-2">
      {rows.map((row) => (
        <TreeNode
          key={row.turn.id}
          row={row}
          selected={row.turn.id === selectedId}
          onSelect={() => onSelect(row.turn.id)}
        />
      ))}
      {truncated && (
        <p className="px-3 py-2 text-[11px] text-muted-foreground">
          Older turns not shown — the recorded window is truncated.
        </p>
      )}
    </div>
  </Region>
)

const LegendDot = ({ color, label }: { color: string; label: string }) => (
  <span className="inline-flex items-center gap-1.5">
    <i className="inline-block h-2 w-2 rounded-[2px]" style={{ backgroundColor: color }} />
    {label}
  </span>
)

const TreeNode = ({
  row,
  selected,
  onSelect,
}: {
  row: TreeRow
  selected: boolean
  onSelect: () => void
}) => {
  const { turn } = row
  const isTool = turn.toolCalls.length > 0
  const preview = turn.userTextPreview?.trim() || turn.assistantTextPreview?.trim() || turn.path
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      style={{ marginLeft: row.depth * 18 }}
      className={cn(
        'flex w-full items-start gap-2.5 rounded-md px-2.5 py-1.5 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
        selected ? 'bg-muted' : 'hover:bg-muted/60',
      )}
    >
      <span
        className="mt-[5px] inline-block h-2 w-2 shrink-0 rounded-full"
        style={{ backgroundColor: isTool ? 'var(--flame-results)' : 'var(--flame-assistant)' }}
        aria-hidden="true"
      />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className="font-mono text-[11px] text-muted-foreground">#{row.index}</span>
          {row.isFork && (
            <span className="rounded-[4px] bg-muted px-1 py-px font-mono text-[9px] font-medium tracking-[0.08em] text-secondary-ink uppercase">
              fork
            </span>
          )}
          <span className="truncate text-[12px] text-foreground">{preview}</span>
        </span>
        {isTool && (
          <span className="mt-0.5 flex flex-wrap gap-1">
            {turn.toolCalls.slice(0, 4).map((c) => (
              <span
                key={c.id}
                className="rounded-[4px] bg-muted px-1.5 py-px font-mono text-[10px] text-secondary-ink"
              >
                {c.func}
              </span>
            ))}
            {turn.toolCalls.length > 4 && (
              <span className="font-mono text-[10px] text-muted-foreground">
                +{turn.toolCalls.length - 4}
              </span>
            )}
          </span>
        )}
      </span>
      <span className="mt-px shrink-0 font-mono text-[11px] tabular-nums text-secondary-ink">
        {formatUsd(estimateCostUsd(turn.model, turn))}
      </span>
    </button>
  )
}

// ── Selected-turn detail ─────────────────────────────────────────────────────

const TurnDetail = ({ turn, index }: { turn: SessionTurn; index: number }) => {
  const values = TOKEN_ROWS.map((r) => turn[r.key] ?? 0)
  const max = Math.max(1, ...values)
  const toolCount = turn.toolCalls.length
  return (
    <div className="border-b border-border px-5 py-4">
      <div className="flex items-baseline justify-between">
        <h4 className="text-[13px] font-semibold">
          Turn {index} · assistant
        </h4>
        <span className="rounded-[5px] bg-muted px-1.5 py-0.5 text-[10px] font-semibold tracking-[0.1em] text-secondary-ink uppercase">
          selected
        </span>
      </div>
      <div className="mt-1 text-[11px] text-muted-foreground">
        {turn.model ?? 'unknown model'} ·{' '}
        {toolCount === 0 ? 'no tool calls' : `${toolCount} tool call${toolCount === 1 ? '' : 's'}`}
      </div>
      <div className="mt-3 space-y-[7px]">
        {TOKEN_ROWS.map((r, i) => (
          <div key={r.key} className="grid grid-cols-[88px_1fr_66px] items-center gap-2.5 text-[12px]">
            <span className="text-secondary-ink">{r.label}</span>
            <span className="h-2 overflow-hidden rounded-[3px] bg-muted">
              <span
                className="block h-full rounded-[3px]"
                style={{ width: `${(values[i]! / max) * 100}%`, backgroundColor: r.color }}
              />
            </span>
            <span className="text-right font-mono tabular-nums text-foreground">
              {formatInt(values[i]!)}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-hairline pt-2.5">
        <span className="text-[9.5px] font-semibold tracking-[0.15em] uppercase text-muted-foreground">
          Turn cost
        </span>
        <span className="font-mono text-[13px] font-medium text-foreground">
          {formatUsd(estimateCostUsd(turn.model, turn))}
        </span>
      </div>
    </div>
  )
}

// ── Context growth (per-turn prompt-token context size across turns) ─────────

const ContextGrowth = ({ turns }: { turns: SessionTurn[] }) => {
  const W = 380
  const H = 120
  const PAD = 6
  const series = turns.map(promptTokens)
  const peak = Math.max(1, ...series)
  const n = series.length
  const x = (i: number) => (n <= 1 ? PAD : PAD + (i / (n - 1)) * (W - 2 * PAD))
  const y = (v: number) => H - PAD - (v / peak) * (H - 2 * PAD)
  const line = series.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const area = `${line} L${x(n - 1).toFixed(1)},${H - PAD} L${x(0).toFixed(1)},${H - PAD} Z`
  return (
    <div className="border-b border-border px-5 py-4">
      <h4 className="flex items-baseline gap-2 text-[13px] font-semibold">
        Context growth
        <span className="text-[11px] font-normal text-muted-foreground">peak {formatCompact(peak)} tok</span>
      </h4>
      {n === 0 ? (
        <div className="mt-3 text-[12px] text-muted-foreground">No requests recorded.</div>
      ) : (
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          role="img"
          aria-label="Prompt-token context size for each turn, in order"
          className="mt-3 h-[120px] w-full"
        >
          <path d={area} fill="var(--ring)" opacity="0.08" />
          <path d={line} fill="none" stroke="var(--ring)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        </svg>
      )}
    </div>
  )
}

// ── Tools in this session ─────────────────────────────────────────────────────

const toolTokens = (t: ToolBucket) => t.inputTokens + t.outputTokens

const SessionTools = ({ tools }: { tools: ToolBucket[] }) => {
  const rows = [...tools].sort((a, b) => b.calls - a.calls).slice(0, 6)
  const total = Math.max(1, tools.reduce((a, t) => a + toolTokens(t), 0))
  return (
    <div className="flex-1 px-5 py-4">
      <h4 className="text-[13px] font-semibold">Tools in this session</h4>
      <div className="mt-2">
        {rows.length === 0 ? (
          <p className="py-2 text-[12px] text-muted-foreground">No tool calls recorded.</p>
        ) : (
          rows.map((t) => (
            <div
              key={t.func}
              className="flex items-center justify-between border-b border-hairline py-[7px] text-[12.5px] last:border-b-0"
            >
              <span className="flex min-w-0 items-center gap-2">
                <i
                  className="inline-block h-2 w-2 shrink-0 rounded-[2px]"
                  style={{ backgroundColor: 'var(--flame-results)' }}
                />
                <span className="truncate font-mono text-foreground">{t.func}</span>
              </span>
              <span className="flex shrink-0 items-baseline gap-2">
                <span className="text-[11px] text-muted-foreground">
                  {formatInt(t.calls)} call{t.calls === 1 ? '' : 's'} ·
                </span>
                <span className="font-mono tabular-nums text-foreground">
                  {formatPercent(toolTokens(t) / total)}
                </span>
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export const SessionPage = ({ id }: { id: string }) => {
  const { navigate } = useRouter()
  const { data, error, isPending, refetch } = useSession(id)
  const insights = useMemo(() => (data ? computeCacheInsights(data.turns) : null), [data])
  const rows = useMemo(() => (data ? layoutTree(data.turns) : []), [data])
  const notFound = error instanceof ApiError && error.status === 404
  const [editing, setEditing] = useState(false)
  const [selectedId, setSelectedId] = useState<number | null>(null)

  // Default the detail panel to the costliest turn — the one worth landing on.
  const selectedRow =
    rows.find((r) => r.turn.id === selectedId) ??
    [...rows].sort(
      (a, b) => (estimateCostUsd(b.turn.model, b.turn) ?? 0) - (estimateCostUsd(a.turn.model, a.turn) ?? 0),
    )[0] ??
    rows[0]

  return (
    <div className="space-y-4">
      {error && (
        <Card className="border-status-critical/40">
          <CardHeader>
            <CardTitle>{notFound ? 'Session not found' : 'Could not load session'}</CardTitle>
            <CardDescription>
              {notFound
                ? `No session with id ${id} has been recorded by the proxy.`
                : error.message}
            </CardDescription>
          </CardHeader>
          {!notFound && (
            <CardContent>
              <Button onClick={() => void refetch()}>Retry</Button>
            </CardContent>
          )}
        </Card>
      )}

      {isPending && <SessionSkeleton />}

      {data && (
        <Surface>
          <DetailHeader
            title={
              <span className="flex items-center gap-3">
                <h1
                  className={cn(
                    'text-[20px] font-semibold tracking-[-0.01em]',
                    !data.session.name && 'font-mono break-all',
                  )}
                >
                  {data.session.name ?? data.session.id}
                </h1>
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="rounded-sm text-xs font-medium text-muted-foreground underline-offset-2 outline-none transition-colors hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-ring"
                >
                  {data.session.name ? 'Rename' : 'Name session'}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    navigate(
                      `/systems/${encodeURIComponent(data.session.systemId)}/compare?a=${encodeURIComponent(data.session.id)}`,
                    )
                  }
                  className="rounded-sm text-xs font-medium text-ring underline-offset-2 outline-none transition-colors hover:underline focus-visible:outline-2 focus-visible:outline-ring"
                >
                  Compare…
                </button>
              </span>
            }
            pill={
              <StatusPill tone="good">
                {data.generatedAt - data.session.lastSeenAt < ACTIVE_WINDOW_MS ? 'active' : 'complete'}
              </StatusPill>
            }
            meta={
              <>
                <span className="text-secondary-ink">
                  system{' '}
                  <Link
                    href={`/systems/${encodeURIComponent(data.session.systemId)}`}
                    className={entLink}
                  >
                    {data.session.systemName}
                  </Link>
                </span>
                <span className="text-secondary-ink">
                  model{' '}
                  <span className="font-mono text-foreground">
                    {data.byModel.length === 1
                      ? data.byModel[0]!.model
                      : `${data.byModel.length} models`}
                  </span>
                </span>
                <MetaItem label="started">{formatTimestamp(data.session.createdAt)}</MetaItem>
                <MetaItem label="duration">
                  {formatDuration(Math.max(0, data.session.lastSeenAt - data.session.createdAt))}
                </MetaItem>
                <span className="text-secondary-ink">
                  {forkCount(data.turns) === 0
                    ? 'linear'
                    : `${forkCount(data.turns)} fork${forkCount(data.turns) === 1 ? '' : 's'}`}
                </span>
              </>
            }
          />

          <GlanceStrip
            eyebrow="Session cost"
            amount={data.session.cost}
            pace={
              <>
                {formatInt(data.session.requests)} messages
                {insights?.hitRate !== null && insights?.hitRate !== undefined && (
                  <>
                    {' '}
                    · <span className="font-medium text-foreground">{formatPercent(insights.hitRate)}</span> from
                    cache
                  </>
                )}
              </>
            }
            cells={[
              { label: 'Input', value: <>{formatCompact(data.session.inputTokens)}</> },
              { label: 'Output', value: <>{formatCompact(data.session.outputTokens)}</> },
              {
                label: 'Peak context',
                value: (
                  <>
                    {formatCompact(insights?.maxPromptTokens ?? 0)}
                    <Unit>tok</Unit>
                  </>
                ),
              },
              { label: 'Tools called', value: formatInt(data.tools.reduce((a, t) => a + t.calls, 0)) },
            ]}
          />

          <div className="grid grid-cols-1 md:grid-cols-[1.35fr_1fr]">
            <SessionTree
              rows={rows}
              selectedId={selectedRow?.turn.id ?? -1}
              onSelect={setSelectedId}
              truncated={data.turnsTruncated}
            />
            <div className="flex min-w-0 flex-col">
              {selectedRow ? (
                <>
                  <TurnDetail turn={selectedRow.turn} index={selectedRow.index} />
                  <ContextGrowth turns={data.turns} />
                  <SessionTools tools={data.tools} />
                </>
              ) : (
                <div className="px-5 py-8 text-[13px] text-muted-foreground">
                  No turns recorded for this session yet.
                </div>
              )}
            </div>
          </div>

          <FootLine>
            <span className="font-mono">session {data.session.id.slice(0, 8)}…</span>
            <span className="font-mono">provider {data.session.providerId}</span>
            <span>estimates use provider list prices</span>
          </FootLine>
        </Surface>
      )}

      {editing && data && (
        <SessionEditDialog
          session={{ id: data.session.id, name: data.session.name }}
          onClose={() => setEditing(false)}
        />
      )}
    </div>
  )
}

const SessionSkeleton = () => (
  <div className="overflow-hidden rounded-lg border bg-card">
    <div className="h-16 animate-pulse border-b bg-muted/60" />
    <div className="h-40 animate-pulse border-b bg-muted/40" />
    <div className="h-72 animate-pulse bg-muted/40" />
  </div>
)
