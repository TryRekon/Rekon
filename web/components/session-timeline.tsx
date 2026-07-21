import { useState } from 'react'
import type { SessionTurn, TurnDetail, TurnToolCall } from '../../shared/api-types'
import { useTurnDetail } from '../lib/queries'
import { CACHE_TTL_MS, type CacheInsights } from '../lib/insights'
import { formatCompact, formatDuration, formatInt, formatTimestamp } from '../lib/format'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Badge } from './ui/badge'

const BAR_SEGMENTS = [
  { key: 'cacheReadTokens', color: 'var(--chart-cache-read)' },
  { key: 'cacheCreationTokens', color: 'var(--chart-cache-write)' },
  { key: 'inputTokens', color: 'var(--chart-input)' },
] as const

interface SessionTimelineProps {
  turns: SessionTurn[]
  insights: CacheInsights
  truncated: boolean
  // Read-only preview (signed-out demo): turns don't expand, so the auth-gated
  // per-turn detail fetch never fires.
  readOnly?: boolean
}

export const SessionTimeline = ({
  turns,
  insights,
  truncated,
  readOnly = false,
}: SessionTimelineProps) => {
  const [expanded, setExpanded] = useState<ReadonlySet<number>>(new Set())

  const toggle = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Timeline</CardTitle>
        <CardDescription>
          Every turn in order{truncated ? ' (older turns omitted — showing the latest 500)' : ''}.
          {readOnly ? '' : ' Expand a turn for the full message text and tool payloads.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0 pb-1">
        {turns.length === 0 ? (
          <p className="px-6 py-6 text-center text-xs text-muted-foreground">
            No requests recorded.
          </p>
        ) : (
          <ol className="divide-y">
            {turns.map((turn, i) => (
              <TurnRow
                key={turn.id}
                turn={turn}
                index={i + 1}
                insights={insights}
                isExpanded={expanded.has(turn.id)}
                onToggle={() => toggle(turn.id)}
                readOnly={readOnly}
              />
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  )
}

interface TurnRowProps {
  turn: SessionTurn
  index: number
  insights: CacheInsights
  isExpanded: boolean
  onToggle: () => void
  readOnly: boolean
}

const TurnRow = ({ turn, index, insights, isExpanded, onToggle, readOnly }: TurnRowProps) => {
  const { data: detail, isError, refetch } = useTurnDetail(turn.id, isExpanded && !readOnly)
  const metrics = insights.metricsByTurn.get(turn.id)
  const gapMs = metrics?.gapMs ?? null
  const longGap = gapMs !== null && gapMs >= CACHE_TTL_MS

  const toolGroups = groupToolCalls(turn.toolCalls)

  const body = (
    <>
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-mono text-xs font-semibold tabular-nums">#{index}</span>
          <span className="text-xs whitespace-nowrap text-muted-foreground">
            {formatTimestamp(turn.createdAt)}
          </span>
          {gapMs !== null && gapMs >= 1000 && (
            <span
              className={`text-xs whitespace-nowrap tabular-nums ${
                longGap ? 'font-medium text-status-serious' : 'text-muted-foreground'
              }`}
              title={
                longGap
                  ? 'Idle longer than the 5-minute cache TTL — the cached prefix expired'
                  : 'Time since the parent turn'
              }
            >
              +{formatDuration(gapMs)}
            </span>
          )}
          {turn.model && (
            <Badge variant="outline" className="font-mono">
              {turn.model}
            </Badge>
          )}
          {turn.stopReason && <Badge variant="outline">{turn.stopReason}</Badge>}
          {metrics?.expiredRewrite && <FlagBadge color="var(--status-serious)" label="cache expired" />}
          {metrics?.coldStart && <FlagBadge color="var(--status-critical)" label="cache miss" />}
          {metrics?.compaction && <FlagBadge color="var(--chart-input)" label="compaction" />}
        </div>

        {turn.userTextPreview && <PreviewLine label="user" text={turn.userTextPreview} />}
        {turn.assistantTextPreview && (
          <PreviewLine label="assistant" text={turn.assistantTextPreview} />
        )}

        {toolGroups.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {toolGroups.map((group) => (
              <Badge key={group.func} variant="secondary" className="font-mono">
                {group.func}
                {group.count > 1 && <span className="text-muted-foreground">×{group.count}</span>}
                {group.errors > 0 && (
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: 'var(--status-critical)' }}
                    title={`${group.errors} failed`}
                  />
                )}
                {group.pending > 0 && (
                  <span className="text-muted-foreground" title="Result not seen yet">
                    …
                  </span>
                )}
              </Badge>
            ))}
          </div>
        )}

        <CompositionBar turn={turn} maxPromptTokens={insights.maxPromptTokens} />
      </div>

      <div className="shrink-0 space-y-0.5 text-right">
        <div className="text-xs font-semibold tabular-nums">
          {turn.newInputTokens !== null
            ? `${turn.newInputTokens >= 0 ? '+' : '−'}${formatCompact(Math.abs(turn.newInputTokens))} new`
            : '—'}
        </div>
        <div className="text-[11px] whitespace-nowrap text-muted-foreground tabular-nums">
          in {formatCompact(turn.inputTokens ?? 0)} · out {formatCompact(turn.outputTokens ?? 0)}
        </div>
        <div className="text-[11px] whitespace-nowrap text-muted-foreground tabular-nums">
          read {formatCompact(turn.cacheReadTokens ?? 0)} · write{' '}
          {formatCompact(turn.cacheCreationTokens ?? 0)}
        </div>
      </div>
    </>
  )

  return (
    <li id={`turn-${turn.id}`} className="scroll-mt-16">
      {readOnly ? (
        <div className="flex w-full items-start gap-3 px-4 py-3">{body}</div>
      ) : (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={isExpanded}
          className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40"
        >
          <svg
            width="10"
            height="10"
            viewBox="0 0 16 16"
            aria-hidden="true"
            className={`mt-1 shrink-0 text-muted-foreground transition-transform ${isExpanded ? 'rotate-90' : ''}`}
          >
            <path
              d="M6 3l5 5-5 5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {body}
        </button>
      )}

      {!readOnly && isExpanded && (
        <div className="space-y-3 border-t border-dashed px-4 py-3 pl-[2.3rem]">
          {isError ? (
            <p className="text-xs text-status-critical">
              Failed to load turn detail.{' '}
              <button
                type="button"
                className="underline underline-offset-2"
                onClick={() => void refetch()}
              >
                Retry
              </button>
            </p>
          ) : detail ? (
            <TurnDetailPanel turn={turn} detail={detail} />
          ) : (
            <div className="h-16 animate-pulse rounded-md bg-muted/60" />
          )}
        </div>
      )}
    </li>
  )
}

const FlagBadge = ({ color, label }: { color: string; label: string }) => (
  <Badge variant="outline">
    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />
    {label}
  </Badge>
)

const PreviewLine = ({ label, text }: { label: string; text: string }) => (
  <p className="text-xs leading-snug">
    <span className="mr-1.5 font-medium text-muted-foreground">{label}</span>
    <span className="break-words whitespace-pre-line line-clamp-2">{text}</span>
  </p>
)

const CompositionBar = ({
  turn,
  maxPromptTokens,
}: {
  turn: SessionTurn
  maxPromptTokens: number
}) => {
  if (maxPromptTokens <= 0) return null
  const segments = BAR_SEGMENTS.map((s) => ({
    color: s.color,
    pct: ((turn[s.key] ?? 0) / maxPromptTokens) * 100,
  })).filter((s) => s.pct > 0)
  if (segments.length === 0) return null
  return (
    <div
      className="flex h-1 w-full overflow-hidden rounded-full bg-muted/50"
      title="Prompt composition relative to the session's largest context"
      aria-hidden="true"
    >
      {segments.map((s, i) => (
        <span key={i} style={{ width: `${s.pct}%`, backgroundColor: s.color }} />
      ))}
    </div>
  )
}

interface ToolGroup {
  func: string
  count: number
  errors: number
  pending: number
}

const groupToolCalls = (calls: TurnToolCall[]): ToolGroup[] => {
  const byFunc = new Map<string, ToolGroup>()
  for (const call of calls) {
    const group = byFunc.get(call.func) ?? { func: call.func, count: 0, errors: 0, pending: 0 }
    group.count += 1
    if (call.isError) group.errors += 1
    if (call.pending) group.pending += 1
    byFunc.set(call.func, group)
  }
  return [...byFunc.values()]
}

const TurnDetailPanel = ({ turn, detail }: { turn: SessionTurn; detail: TurnDetail }) => {
  const empty = !detail.userText && !detail.assistantText && detail.toolCalls.length === 0
  return (
    <>
      {empty && (
        <p className="text-xs text-muted-foreground">
          Nothing stored for this turn — it predates message-text capture and made no tool calls.
        </p>
      )}
      {detail.userText && <TextBlock label="User" text={detail.userText} />}
      {detail.assistantText && <TextBlock label="Assistant" text={detail.assistantText} />}
      {detail.toolCalls.map((call) => (
        <div key={call.id} className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="font-mono">
              {call.func}
            </Badge>
            <span className="text-[11px] text-muted-foreground tabular-nums">
              in ~{formatInt(call.inputTokens)} · out ~{formatInt(call.outputTokens)} tok
            </span>
            {call.isError && (
              <Badge variant="outline">
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: 'var(--status-critical)' }}
                  aria-hidden="true"
                />
                error
              </Badge>
            )}
            {call.output === null && <Badge variant="outline">pending</Badge>}
          </div>
          {call.input && <TextBlock label="Input" text={call.input} />}
          {call.output && <TextBlock label="Result" text={call.output} />}
        </div>
      ))}
      {turn.toolCalls.length > 0 && detail.toolCalls.length === 0 && (
        <p className="text-xs text-muted-foreground">Tool payloads not found for this turn.</p>
      )}
    </>
  )
}

const TextBlock = ({ label, text }: { label: string; text: string }) => (
  <div>
    <div className="pb-1 text-[11px] font-medium text-muted-foreground uppercase">{label}</div>
    <pre className="max-h-64 overflow-y-auto rounded-md border bg-muted/30 p-2.5 font-mono text-[11px] leading-relaxed break-words whitespace-pre-wrap">
      {text}
    </pre>
  </div>
)
