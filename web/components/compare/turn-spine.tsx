import { useEffect, useState } from 'react'
import type { SessionDetail, SessionTurn } from '../../../shared/api-types'
import type { Divergence } from '../../lib/compare'
import { newInputPerTurn, sharedPrefixLength } from '../../lib/compare'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { Button } from '../ui/button'
import { formatCompact, formatDuration, formatTimestamp } from '../../lib/format'
import { cn } from '../../lib/utils'

// How many aligned rows to show after the divergence before collapsing.
const SAMPLE_ROWS = 2

export interface TurnFocus {
  index: number
  // Bumped on every request so re-clicking the same turn re-scrolls.
  seq: number
}

interface TurnSpineProps {
  a: SessionDetail
  b: SessionDetail
  divergence: Divergence | null
  focus: TurnFocus | null
}

const runLabel = (d: SessionDetail): string => d.session.name ?? `${d.session.id.slice(0, 8)}…`

const RunHeader = ({ run, detail }: { run: 'a' | 'b'; detail: SessionDetail }) => (
  <div
    className={cn(
      'flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5 rounded-md border border-l-2 px-3 py-2',
      run === 'a' ? 'border-l-run-a bg-run-a/5' : 'border-l-run-b bg-run-b/10',
    )}
  >
    <span
      className={cn(
        'text-xs font-semibold',
        run === 'a' ? 'text-secondary-ink' : 'text-run-b',
      )}
    >
      Run {run.toUpperCase()}
    </span>
    <span className="truncate font-mono text-xs" title={detail.session.id}>
      {runLabel(detail)}
    </span>
    <span className="ml-auto text-[11px] whitespace-nowrap text-muted-foreground">
      {formatTimestamp(detail.session.createdAt)} · {detail.turns.length} turns
    </span>
  </div>
)

const CenterPill = ({ children, accent }: { children: string; accent?: boolean }) => (
  <div className="flex justify-center">
    <span
      className={cn(
        'inline-flex h-6 min-w-7 items-center justify-center rounded-full border bg-card px-1.5 text-[11px] font-medium tabular-nums',
        accent && 'border-ring text-ring',
      )}
    >
      {children}
    </span>
  </div>
)

const TurnCell = ({ run, turn, added }: { run: 'a' | 'b'; turn: SessionTurn; added: number }) => {
  const preview = turn.userTextPreview ?? turn.assistantTextPreview
  const funcs = turn.toolCalls.map((c) => c.func)
  const shown = funcs.slice(0, 3)
  return (
    <div
      className={cn(
        'flex min-w-0 flex-col gap-1.5 rounded-md border border-l-2 px-3 py-2',
        run === 'a' ? 'border-l-run-a' : 'border-l-run-b',
      )}
    >
      <div className="flex items-center gap-2">
        <span
          className={cn(
            'rounded px-1 text-[10px] font-semibold',
            run === 'a' ? 'bg-run-a/15 text-secondary-ink' : 'bg-run-b/15 text-run-b',
          )}
        >
          {run.toUpperCase()}
        </span>
        <span className="ml-auto text-[11px] tabular-nums whitespace-nowrap text-muted-foreground">
          {added >= 0 ? '+' : '−'}
          {formatCompact(Math.abs(added))} new input
        </span>
      </div>
      {shown.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {shown.map((func, i) => (
            <span
              key={`${func}-${i}`}
              className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-secondary-ink"
            >
              {func}
            </span>
          ))}
          {funcs.length > shown.length && (
            <span className="px-0.5 py-0.5 text-[10px] text-muted-foreground">
              +{funcs.length - shown.length}
            </span>
          )}
        </div>
      )}
      {preview && <p className="truncate text-xs text-secondary-ink">{preview}</p>}
    </div>
  )
}

const EndCard = ({ run, detail }: { run: 'a' | 'b'; detail: SessionDetail }) => (
  <div
    className={cn(
      'rounded-md border border-l-2 px-3 py-2',
      run === 'a' ? 'border-l-run-a' : 'border-l-run-b',
    )}
  >
    <p className="text-xs font-semibold">Run {run.toUpperCase()} complete</p>
    <p className="text-[11px] text-muted-foreground">
      {detail.turns.length} turns ·{' '}
      {formatDuration(detail.session.lastSeenAt - detail.session.createdAt)}
    </p>
  </div>
)

const SideNote = ({ children, align }: { children: string; align: 'left' | 'right' }) => (
  <p
    className={cn(
      'self-center text-xs text-muted-foreground',
      align === 'right' ? 'text-right' : 'text-left',
    )}
  >
    {children}
  </p>
)

export const TurnSpineCard = ({ a, b, divergence, focus }: TurnSpineProps) => {
  const [expanded, setExpanded] = useState(false)

  const prefix = sharedPrefixLength(a, b, divergence)
  const addedA = newInputPerTurn(a.turns)
  const addedB = newInputPerTurn(b.turns)
  const minLen = Math.min(a.turns.length, b.turns.length)
  const maxLen = Math.max(a.turns.length, b.turns.length)
  const divergeIndex = divergence?.index ?? null

  // Aligned rows begin right after the divergence card (or after the identical
  // prefix when the runs never diverge).
  const rowsStart = (divergeIndex ?? prefix) + 1
  const sampleEnd = Math.min(rowsStart + SAMPLE_ROWS - 1, maxLen)
  const hiddenCount = expanded ? 0 : Math.max(0, maxLen - sampleEnd)

  useEffect(() => {
    if (!focus) return
    setExpanded(true)
    // Wait a frame so the expanded rows exist before scrolling.
    const id = requestAnimationFrame(() => {
      document
        .getElementById(`compare-turn-${focus.index}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
    return () => cancelAnimationFrame(id)
  }, [focus])

  const rowEnd = expanded ? maxLen : sampleEnd
  const rowIndices: number[] = []
  for (let i = rowsStart; i <= rowEnd; i++) rowIndices.push(i)

  const turnAt = (d: SessionDetail, index: number): SessionTurn | undefined => d.turns[index - 1]

  const divergeTextOf = (d: SessionDetail): string => {
    const turn = divergeIndex ? turnAt(d, divergeIndex) : undefined
    if (!turn) return '(run has no turn at this index)'
    if (divergence?.kind === 'behavior') {
      const funcs = turn.toolCalls.map((c) => c.func)
      return funcs.length > 0 ? funcs.join(', ') : '(no tool calls this turn)'
    }
    return turn.userTextPreview ?? '(no new user text this turn)'
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Turn by turn</CardTitle>
        <CardDescription>
          Two parallel conversations aligned by turn
          {prefix > 0 && ` — identical through turn ${prefix}`}
          {divergeIndex && `, then evolving separately`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-x-3 gap-y-2 sm:grid-cols-[1fr_2.5rem_1fr]">
          <RunHeader run="a" detail={a} />
          <div className="hidden sm:block" />
          <RunHeader run="b" detail={b} />

          {prefix > 0 && (
            <>
              <div className="hidden sm:col-start-2 sm:block">
                <CenterPill>{prefix === 1 ? '1' : `1–${prefix}`}</CenterPill>
              </div>
              <div className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground sm:col-span-3 sm:col-start-1">
                Turns {prefix === 1 ? '1' : `1–${prefix}`} — identical prompts and tool sequence
                in both runs
              </div>
            </>
          )}

          {divergence && divergeIndex && (
            <>
              <div className="hidden sm:col-start-2 sm:block">
                <CenterPill accent>{String(divergeIndex)}</CenterPill>
              </div>
              <div
                id={`compare-turn-${divergeIndex}`}
                className="rounded-md border border-l-2 border-l-ring px-3.5 py-3 sm:col-span-3 sm:col-start-1"
              >
                <p className="pb-2 text-[11px] font-semibold tracking-wide text-ring uppercase">
                  Turn {divergeIndex} ·{' '}
                  {divergence.kind === 'prompt' ? 'prompts diverge here' : 'behavior diverges here'}
                </p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {([['a', a], ['b', b]] as const).map(([run, detail]) => (
                    <div key={run} className="min-w-0">
                      <p className="flex items-center gap-1.5 pb-1 text-[11px] font-semibold">
                        <span
                          className={cn(
                            'h-2 w-2 rounded-[3px]',
                            run === 'a' ? 'bg-run-a' : 'bg-run-b',
                          )}
                          aria-hidden="true"
                        />
                        Run {run.toUpperCase()} ·{' '}
                        {divergence.kind === 'prompt' ? 'user' : 'tool calls'}
                      </p>
                      <p
                        className={cn(
                          'text-xs break-words text-secondary-ink',
                          divergence.kind === 'behavior' && 'font-mono',
                        )}
                      >
                        {divergeTextOf(detail)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {rowIndices.map((i) => {
            const ta = turnAt(a, i)
            const tb = turnAt(b, i)
            if (!ta && !tb) return null
            return (
              <div
                key={i}
                id={`compare-turn-${i}`}
                className="grid grid-cols-1 gap-x-3 gap-y-1 sm:col-span-3 sm:grid-cols-subgrid"
              >
                {ta ? <TurnCell run="a" turn={ta} added={addedA[i - 1] ?? 0} /> : <div className="hidden sm:block" />}
                <div className="hidden sm:block">
                  <CenterPill>{String(i)}</CenterPill>
                </div>
                {tb ? <TurnCell run="b" turn={tb} added={addedB[i - 1] ?? 0} /> : <div className="hidden sm:block" />}
              </div>
            )
          })}

          {hiddenCount > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-dashed px-3 py-2 sm:col-span-3">
              <span className="text-xs text-muted-foreground">
                {hiddenCount} more turn{hiddenCount === 1 ? '' : 's'} — evolving separately
              </span>
              <Button variant="ghost" onClick={() => setExpanded(true)}>
                Show all turns
              </Button>
            </div>
          )}

          {minLen !== maxLen && (
            <div className="grid grid-cols-1 gap-x-3 sm:col-span-3 sm:grid-cols-subgrid">
              {a.turns.length === minLen ? (
                <>
                  <EndCard run="a" detail={a} />
                  <div className="hidden sm:block">
                    {/* Skip the pill when the aligned rows already showed this index. */}
                    {minLen > rowEnd && <CenterPill>{String(minLen)}</CenterPill>}
                  </div>
                  <SideNote align="left">{`Run B — ${maxLen - minLen} turn${maxLen - minLen === 1 ? '' : 's'} still to run`}</SideNote>
                </>
              ) : (
                <>
                  <SideNote align="right">{`Run A — ${maxLen - minLen} turn${maxLen - minLen === 1 ? '' : 's'} still to run`}</SideNote>
                  <div className="hidden sm:block">
                    {minLen > rowEnd && <CenterPill>{String(minLen)}</CenterPill>}
                  </div>
                  <EndCard run="b" detail={b} />
                </>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 gap-x-3 sm:col-span-3 sm:grid-cols-subgrid">
            {a.turns.length === maxLen ? (
              <>
                <EndCard run="a" detail={a} />
                <div className="hidden sm:block">
                  {maxLen > rowEnd && <CenterPill>{String(maxLen)}</CenterPill>}
                </div>
                {minLen !== maxLen ? (
                  <SideNote align="left">{`Run B ended ${maxLen - minLen} turn${maxLen - minLen === 1 ? '' : 's'} earlier`}</SideNote>
                ) : (
                  <EndCard run="b" detail={b} />
                )}
              </>
            ) : (
              <>
                <SideNote align="right">{`Run A ended ${maxLen - minLen} turn${maxLen - minLen === 1 ? '' : 's'} earlier`}</SideNote>
                <div className="hidden sm:block">
                  {maxLen > rowEnd && <CenterPill>{String(maxLen)}</CenterPill>}
                </div>
                <EndCard run="b" detail={b} />
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
