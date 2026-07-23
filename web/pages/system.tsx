import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { ModelBucket, SessionSummary, SystemSummary, SystemTool } from '../../shared/api-types'
import { ApiError, renameSystem } from '../lib/api'
import { queryKeys, useSystem } from '../lib/queries'
import { formatCompact, formatInt, formatPercent, formatTimestamp, formatUsd } from '../lib/format'
import { cn } from '../lib/utils'
import { Link } from '../lib/router'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Unbacked } from '../components/ui/unbacked'
import { SetupInstructions, systemBaseUrl } from '../components/setup-instructions'
import {
  ColHeader,
  DetailHeader,
  EmptyRow,
  FootLine,
  GlanceStrip,
  MetaItem,
  RowBar,
  StatusPill,
  Surface,
  Th,
  entLink,
  numCell,
  tdBase,
} from '../components/detail-surface'

// SystemTool carries only input/output token counts (no cache fields), so a
// tool's token weight is input + output.
const toolTokens = (t: SystemTool) => t.inputTokens + t.outputTokens
const modelTokens = (m: ModelBucket) =>
  m.inputTokens + m.outputTokens + m.cacheReadTokens + m.cacheCreationTokens

const posDenom = (n: number) => (n > 0 ? n : 1)
const costOrNeg = (c: number | null) => (c === null ? -1 : c)

// Fraction of the prompt served from cache = read / (input + read + write), the
// same write-inclusive prompt-cache ratio the Session page reports via
// insights.hitRate. (Note: dashboard-metrics.cacheHitRatio excludes cache
// writes, so this can differ from the dashboard's headline hit-rate by design.)
const cacheHit = (s: SystemSummary): number => {
  const prompt = s.inputTokens + s.cacheReadTokens + s.cacheCreationTokens
  return prompt > 0 ? s.cacheReadTokens / prompt : 0
}

// Model id → provider label. Deterministic from the model family prefix, so the
// provider set is derived (backed), not a stored field.
const providerOf = (model: string): string => {
  if (model.startsWith('claude')) return 'Anthropic'
  if (/^(gpt|o1|o3|o4)/.test(model)) return 'OpenAI'
  return 'Other'
}
const providersFrom = (byModel: ModelBucket[]): string[] => {
  const seen = new Set<string>()
  const out: string[] = []
  for (const m of byModel) {
    const p = providerOf(m.model)
    if (!seen.has(p)) {
      seen.add(p)
      out.push(p)
    }
  }
  return out
}

// The display name with an inline rename affordance — the id (and the ingest
// URL built from it) never changes.
const SystemName = ({ id, name }: { id: string; name: string }) => {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    const next = draft.trim()
    if (!next || next === name) {
      setEditing(false)
      return
    }
    setSaving(true)
    try {
      await renameSystem(id, next)
      setEditing(false)
      await queryClient.invalidateQueries({ queryKey: queryKeys.system(id) })
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      void queryClient.invalidateQueries({ queryKey: queryKeys.systems })
    } finally {
      setSaving(false)
    }
  }

  if (!editing) {
    return (
      <span className="flex items-baseline gap-3">
        <h1 className="text-[20px] font-semibold tracking-[-0.01em] break-all">{name}</h1>
        <button
          type="button"
          onClick={() => {
            setDraft(name)
            setEditing(true)
          }}
          className="text-xs font-medium text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
        >
          Rename
        </button>
      </span>
    )
  }
  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
    >
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        maxLength={100}
        className="h-9 rounded-md border bg-card px-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-ring"
      />
      <Button disabled={saving} onClick={() => void save()}>
        Save
      </Button>
      <Button variant="ghost" disabled={saving} onClick={() => setEditing(false)}>
        Cancel
      </Button>
    </form>
  )
}

// A tiny copy affordance for the dark proxy code block — mirrors the artifact's
// COPY button without pulling in the full tabbed SetupInstructions.
const CopyChip = ({ text }: { text: string }) => {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }}
      className="absolute top-2.5 right-2.5 rounded-md border border-sidebar-border bg-sidebar-hover px-2.5 py-1 font-sans text-[10px] font-semibold tracking-[0.06em] text-sidebar-foreground transition-colors outline-none hover:text-sidebar-bright focus-visible:outline-2 focus-visible:outline-ring"
    >
      {copied ? 'COPIED' : 'COPY'}
    </button>
  )
}

// The proxy endpoint as a first-class object: a dark, copyable code block that
// carries the real ingest URL for both client families.
const ProxyEndpoint = ({ id }: { id: string }) => {
  const base = systemBaseUrl(id)
  return (
    <div className="bg-card px-4 py-4 md:px-6">
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
        <span className="text-[9.5px] font-semibold tracking-[0.15em] uppercase text-muted-foreground">
          Proxy endpoint · point your client here
        </span>
        <span className="text-[11px] font-medium text-status-serious">
          ▲ treat this URL as a secret — it doubles as the ingest key
        </span>
      </div>
      <div className="relative overflow-x-auto rounded-lg bg-sidebar px-4 py-3.5 font-mono text-[12.5px] leading-[1.9] text-sidebar-foreground">
        <CopyChip text={`export ANTHROPIC_BASE_URL=${base}`} />
        <div className="text-sidebar-muted"># Anthropic clients</div>
        <div>
          <span className="text-logo-stroke">export</span>{' '}
          <span className="text-sidebar-bright">ANTHROPIC_BASE_URL</span>=
          <span className="break-all text-chart-output">{base}</span>
        </div>
        <div className="mt-2 text-sidebar-muted"># OpenAI clients add /openai/v1</div>
        <div>
          <span className="text-logo-stroke">export</span>{' '}
          <span className="text-sidebar-bright">OPENAI_BASE_URL</span>=
          <span className="break-all text-chart-output">{base}/openai/v1</span>
        </div>
      </div>
    </div>
  )
}

const SessionsByCost = ({ sessions }: { sessions: SessionSummary[] }) => {
  const rows = [...sessions].sort((a, b) => costOrNeg(b.cost) - costOrNeg(a.cost)).slice(0, 6)
  const peak = posDenom(Math.max(0, ...rows.map((s) => s.cost ?? 0)))
  return (
    <section className="min-w-0 border-b border-border md:border-r md:border-b-0">
      <ColHeader
        label="Sessions by cost"
        action={
          <Link href="/costs" className="text-[11px] text-ring hover:underline">
            all {formatInt(sessions.length)} →
          </Link>
        }
      />
      <table className="w-full border-collapse text-[12.5px]">
        <thead>
          <tr>
            <Th>Session</Th>
            <Th right>Msgs</Th>
            <Th right>Cost</Th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <EmptyRow colSpan={3}>No sessions yet.</EmptyRow>
          ) : (
            rows.map((s) => (
              <tr key={s.id} className="hover:bg-muted">
                <td className={tdBase}>
                  <Link
                    href={`/sessions/${encodeURIComponent(s.id)}`}
                    className={entLink}
                    title={s.name ?? s.id}
                  >
                    {s.name ?? `${s.id.slice(0, 8)}…`}
                  </Link>
                  <div className="mt-px text-[11px] text-muted-foreground">
                    {formatTimestamp(s.createdAt)}
                  </div>
                  <RowBar pct={((s.cost ?? 0) / peak) * 100} />
                </td>
                <td className={numCell}>{formatInt(s.requests)}</td>
                <td className={cn(numCell, 'font-medium text-foreground')}>{formatUsd(s.cost)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </section>
  )
}

const ModelsAndTools = ({
  byModel,
  tools,
}: {
  byModel: ModelBucket[]
  tools: SystemTool[]
}) => {
  const models = [...byModel].sort((a, b) => modelTokens(b) - modelTokens(a)).slice(0, 5)
  const modelTotal = posDenom(byModel.reduce((a, m) => a + modelTokens(m), 0))
  const topTools = [...tools].sort((a, b) => toolTokens(b) - toolTokens(a)).slice(0, 5)
  const toolTotal = posDenom(tools.reduce((a, t) => a + toolTokens(t), 0))
  return (
    <section className="min-w-0">
      <ColHeader label="Models" />
      <table className="w-full border-collapse text-[12.5px]">
        <tbody>
          {models.length === 0 ? (
            <EmptyRow colSpan={3}>No model activity.</EmptyRow>
          ) : (
            models.map((m) => (
              <tr key={m.model} className="hover:bg-muted">
                <td className={tdBase}>
                  <span className="break-words" title={m.model}>
                    {m.model}
                  </span>
                  <RowBar pct={(modelTokens(m) / modelTotal) * 100} />
                </td>
                <td className={numCell}>{formatPercent(modelTokens(m) / modelTotal)}</td>
                <td className={cn(numCell, 'font-medium text-foreground')}>{formatUsd(m.cost)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      <ColHeader label="Tools · share of tokens" topBorder />
      <table className="w-full border-collapse text-[12.5px]">
        <tbody>
          {topTools.length === 0 ? (
            <EmptyRow colSpan={3}>No tool activity.</EmptyRow>
          ) : (
            topTools.map((t) => (
              <tr key={t.func} className="hover:bg-muted">
                <td className={tdBase}>
                  <span className="break-words" title={t.func}>
                    {t.func}
                  </span>
                </td>
                <td className={cn(tdBase, 'w-[104px]')}>
                  <RowBar pct={(toolTokens(t) / toolTotal) * 100} color="var(--chart-cache-write)" />
                </td>
                <td className={numCell}>{formatPercent(toolTokens(t) / toolTotal)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </section>
  )
}

export const SystemPage = ({ id }: { id: string }) => {
  const { data, error, isPending, refetch } = useSystem(id)
  const notFound = error instanceof ApiError && error.status === 404
  const awaitingFirstEvent = data?.system.firstEventAt === null

  return (
    <div className="space-y-4">
      {error && (
        <Card className="border-status-critical/40">
          <CardHeader>
            <CardTitle>{notFound ? 'System not found' : 'Could not load system'}</CardTitle>
            <CardDescription>
              {notFound ? `No system with id ${id} exists in your account.` : error.message}
            </CardDescription>
          </CardHeader>
          {!notFound && (
            <CardContent>
              <Button onClick={() => void refetch()}>Retry</Button>
            </CardContent>
          )}
        </Card>
      )}

      {isPending && <SystemSkeleton />}

      {data && awaitingFirstEvent && (
        <>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-2">
            <SystemName id={id} name={data.system.name} />
            <span className="text-xs text-muted-foreground">
              created {formatTimestamp(data.system.createdAt)}
            </span>
          </div>
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle>Waiting for first request</CardTitle>
                <Badge variant="outline">
                  <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-status-serious" />
                  pending
                </Badge>
              </div>
              <CardDescription>
                Route an Anthropic or OpenAI client through this system's proxy URL and its usage
                will appear here.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <SetupInstructions systemId={id} />
            </CardContent>
          </Card>
        </>
      )}

      {data && !awaitingFirstEvent && (
        <Surface>
          <DetailHeader
            title={<SystemName id={id} name={data.system.name} />}
            pill={<StatusPill tone="good">active</StatusPill>}
            meta={
              <>
                <MetaItem label="created">{formatTimestamp(data.system.createdAt)}</MetaItem>
                <MetaItem label="providers">{providersFrom(data.byModel).join(' + ') || '—'}</MetaItem>
                {data.system.firstEventAt !== null && (
                  <span className="text-secondary-ink">
                    first event{' '}
                    <span className="font-mono text-foreground">
                      {formatTimestamp(data.system.firstEventAt)}
                    </span>
                  </span>
                )}
              </>
            }
          />

          <GlanceStrip
            eyebrow="Est. spend"
            amount={data.system.cost}
            pace={
              // TODO(stitch-gap): SystemDetail has no per-day series, so month-end
              // spend cannot be projected — flag until the API returns system byDay.
              <Unbacked variant="inline" label="Month-end spend projection" note="no per-system daily series">
                <span>projected month-end spend</span>
              </Unbacked>
            }
            cells={[
              { label: 'Sessions', value: formatInt(data.system.sessions) },
              { label: 'Requests', value: formatInt(data.system.requests) },
              { label: 'Cache hit', value: formatPercent(cacheHit(data.system)) },
              {
                label: 'Cache read',
                value: <>{formatCompact(data.system.cacheReadTokens)}</>,
              },
            ]}
          />

          <ProxyEndpoint id={id} />

          <div className="border-t border-border">
            <ColHeader
              label="Spend · last 30 days"
              action={
                // TODO(stitch-gap): peak-day callout needs the per-system daily series.
                <Unbacked variant="inline" label="30-day peak-day callout" note="no per-system daily series">
                  <span className="text-[11px] text-secondary-ink">peak day pending</span>
                </Unbacked>
              }
            />
            <div className="px-4 py-4 md:px-6">
              {/* TODO(stitch-gap): no per-system daily spend series on SystemDetail —
                  render the trend chart once the API returns system byDay buckets. */}
              <Unbacked label="System spend · 30-day trend" note="no per-system daily series" className="h-[150px]" />
            </div>
          </div>

          <div className="grid grid-cols-1 border-t border-border md:grid-cols-[1.4fr_1fr]">
            <SessionsByCost sessions={data.sessions} />
            <ModelsAndTools byModel={data.byModel} tools={data.tools} />
          </div>

          <FootLine>
            <span className="font-mono">
              {formatInt(data.system.sessions)} sessions · {formatInt(data.system.requests)} requests
            </span>
            <span className="font-mono">
              {data.byModel.length} models · {providersFrom(data.byModel).length} providers
            </span>
            <span>estimates use provider list prices</span>
          </FootLine>
        </Surface>
      )}
    </div>
  )
}

const SystemSkeleton = () => (
  <div className="overflow-hidden rounded-lg border bg-card">
    <div className="h-16 animate-pulse border-b bg-muted/60" />
    <div className="h-40 animate-pulse border-b bg-muted/40" />
    <div className="h-24 animate-pulse border-b bg-muted/60" />
    <div className="h-72 animate-pulse bg-muted/40" />
  </div>
)
