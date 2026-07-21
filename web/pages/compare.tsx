import { useMemo, useState } from 'react'
import type { SessionDetail, SessionSummary } from '../../shared/api-types'
import { ApiError } from '../lib/api'
import { useSessionSlot, useSystem } from '../lib/queries'
import {
  cacheHitRates,
  configFlags,
  diffTools,
  diffToolsets,
  diffTotals,
  findDivergence,
} from '../lib/compare'
import { useRouter } from '../lib/router'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { WhatChangedCard } from '../components/compare/what-changed'
import { ScorecardCard } from '../components/compare/scorecard'
import { CompareChartCard } from '../components/compare/compare-chart'
import { ToolDiffCard } from '../components/compare/tool-diff-table'
import { TurnSpineCard, type TurnFocus } from '../components/compare/turn-spine'
import { formatTimestamp } from '../lib/format'
import { cn } from '../lib/utils'

interface ComparePageProps {
  systemId: string
  a: string | null
  b: string | null
}

const compareUrl = (systemId: string, a: string | null, b: string | null): string => {
  const params = new URLSearchParams()
  if (a) params.set('a', a)
  if (b) params.set('b', b)
  const query = params.toString()
  return `/systems/${encodeURIComponent(systemId)}/compare${query ? `?${query}` : ''}`
}

const optionLabel = (s: SessionSummary): string =>
  `${s.name ?? s.id.slice(0, 8)} — ${formatTimestamp(s.createdAt)} · ${s.requests} req`

const SlotPicker = ({
  run,
  value,
  sessions,
  onChange,
}: {
  run: 'a' | 'b'
  value: string | null
  sessions: SessionSummary[]
  onChange: (id: string) => void
}) => (
  <label className="flex min-w-0 items-center gap-2">
    <span
      className={cn('h-2 w-2 shrink-0 rounded-full', run === 'a' ? 'bg-run-a' : 'bg-run-b')}
      aria-hidden="true"
    />
    <span className="sr-only">{run === 'a' ? 'Session A' : 'Session B'}</span>
    <select
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 min-w-0 max-w-64 rounded-md border bg-card px-2 text-xs shadow-2xs focus-visible:outline-2 focus-visible:outline-ring"
    >
      <option value="" disabled>
        {run === 'a' ? 'Choose run A…' : 'Choose run B…'}
      </option>
      {sessions.map((s) => (
        <option key={s.id} value={s.id}>
          {optionLabel(s)}
        </option>
      ))}
    </select>
  </label>
)

const SlotError = ({ run, error }: { run: 'a' | 'b'; error: Error }) => (
  <Card className="border-status-critical/40">
    <CardHeader>
      <CardTitle>Couldn't load run {run.toUpperCase()}</CardTitle>
      <CardDescription>
        {error instanceof ApiError && error.status === 404
          ? 'No session with that id has been recorded by the proxy.'
          : error.message}
      </CardDescription>
    </CardHeader>
  </Card>
)

const CompareSkeleton = () => (
  <div className="space-y-4">
    <div className="h-24 animate-pulse rounded-lg border bg-muted/60" />
    <div className="h-64 animate-pulse rounded-lg border bg-muted/60" />
    <div className="h-72 animate-pulse rounded-lg border bg-muted/60" />
  </div>
)

const Comparison = ({ a, b }: { a: SessionDetail; b: SessionDetail }) => {
  const [focus, setFocus] = useState<TurnFocus | null>(null)

  const derived = useMemo(
    () => ({
      rows: diffTotals(a, b),
      hitRates: cacheHitRates(a, b),
      toolsetDiff: diffToolsets(a, b),
      toolRows: diffTools(a, b),
      divergence: findDivergence(a, b),
      flags: configFlags(a, b),
    }),
    [a, b],
  )

  const jumpToTurn = (index: number) =>
    setFocus((prev) => ({ index, seq: (prev?.seq ?? 0) + 1 }))

  return (
    <>
      <WhatChangedCard
        a={a}
        b={b}
        toolsetDiff={derived.toolsetDiff}
        divergence={derived.divergence}
        flags={derived.flags}
        onJumpToDivergence={() => {
          if (derived.divergence) jumpToTurn(derived.divergence.index)
        }}
      />
      <ScorecardCard
        rows={derived.rows}
        hitRates={derived.hitRates}
        crossProvider={derived.flags.crossProvider}
        aLabel={`Run A · ${formatTimestamp(a.session.createdAt)}`}
        bLabel={`Run B · ${formatTimestamp(b.session.createdAt)}`}
      />
      <CompareChartCard a={a} b={b} divergence={derived.divergence} onSelectTurn={jumpToTurn} />
      <ToolDiffCard rows={derived.toolRows} />
      <TurnSpineCard a={a} b={b} divergence={derived.divergence} focus={focus} />
    </>
  )
}

export const ComparePage = ({ systemId, a, b }: ComparePageProps) => {
  const { navigate } = useRouter()
  const system = useSystem(systemId)
  const slotA = useSessionSlot(a)
  const slotB = useSessionSlot(b)

  const sessions = system.data?.sessions ?? []
  const setSlot = (slot: 'a' | 'b', id: string) =>
    navigate(compareUrl(systemId, slot === 'a' ? id : a, slot === 'b' ? id : b))

  // A session fetched by id isn't inherently scoped to the route's system —
  // reject slots that belong elsewhere instead of comparing across systems.
  const foreign = (d: SessionDetail | undefined): boolean =>
    d !== undefined && d.session.systemId !== systemId

  const sameSession = a !== null && a === b
  const bothChosen = a !== null && b !== null
  const loading = (a !== null && slotA.isPending) || (b !== null && slotB.isPending)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Compare sessions</h1>
          <p className="text-xs text-muted-foreground">
            {system.data
              ? `Two runs from ${system.data.system.name}, side by side — what changed, and whether it helped.`
              : 'Two runs, side by side — what changed, and whether it helped.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SlotPicker run="a" value={a} sessions={sessions} onChange={(id) => setSlot('a', id)} />
          <Button
            variant="ghost"
            aria-label="Swap runs"
            title="Swap runs"
            disabled={!bothChosen}
            onClick={() => navigate(compareUrl(systemId, b, a))}
          >
            ⇄
          </Button>
          <SlotPicker run="b" value={b} sessions={sessions} onChange={(id) => setSlot('b', id)} />
        </div>
      </div>

      {sameSession && (
        <Card>
          <CardHeader>
            <CardTitle>Pick two different runs</CardTitle>
            <CardDescription>
              Both slots point at the same session — choose a different run for one side.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {!sameSession && !bothChosen && (
        <Card>
          <CardHeader>
            <CardTitle>Pick two runs of the same task</CardTitle>
            <CardDescription>
              Choose a baseline (run A) and a comparison (run B) above. The diff shows what
              changed between them — toolset, prompts, model — and what it did to tokens and
              cost.
            </CardDescription>
          </CardHeader>
          {sessions.length < 2 && system.data && (
            <CardContent>
              <p className="text-xs text-muted-foreground">
                This system has {sessions.length === 0 ? 'no' : 'only one'} recorded session
                {sessions.length === 1 ? '' : 's'} — run the task through the proxy twice to
                compare runs.
              </p>
            </CardContent>
          )}
        </Card>
      )}

      {slotA.error && a !== null && <SlotError run="a" error={slotA.error} />}
      {slotB.error && b !== null && <SlotError run="b" error={slotB.error} />}
      {(foreign(slotA.data) || foreign(slotB.data)) && (
        <Card className="border-status-critical/40">
          <CardHeader>
            <CardTitle>Session belongs to a different system</CardTitle>
            <CardDescription>
              Compare works within one system — both sessions must have been recorded under this
              system's proxy URL.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {!sameSession && bothChosen && loading && <CompareSkeleton />}

      {!sameSession &&
        slotA.data &&
        slotB.data &&
        !foreign(slotA.data) &&
        !foreign(slotB.data) && <Comparison a={slotA.data} b={slotB.data} />}
    </div>
  )
}
