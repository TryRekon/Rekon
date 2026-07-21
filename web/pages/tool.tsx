import { useMemo, useState } from 'react'
import type { ToolDayBucket } from '../../shared/api-types'
import { ApiError } from '../lib/api'
import { useTool } from '../lib/queries'
import { formatInt, formatPercent, formatRelative, formatTimestamp, formatUtcDay } from '../lib/format'
import { Link } from '../lib/router'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table'
import { StatStrip, StatTile } from '../components/stat-tile'

const DAY_MS = 86_400_000

const utcDayString = (ms: number): string => new Date(ms).toISOString().slice(0, 10)

const prettySchema = (schemaJson: string): string => {
  try {
    return JSON.stringify(JSON.parse(schemaJson), null, 2)
  } catch {
    return schemaJson
  }
}

export const ToolPage = ({ systemId, name }: { systemId: string; name: string }) => {
  const { data, error, isPending, refetch } = useTool(systemId, name)
  const notFound = error instanceof ApiError && error.status === 404

  return (
    <div className="space-y-4">
      {error && (
        <Card className="border-status-critical/40">
          <CardHeader>
            <CardTitle>{notFound ? 'Tool not found' : 'Could not load tool'}</CardTitle>
            <CardDescription>
              {notFound
                ? `No tool named ${name} has been recorded for system ${systemId}.`
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

      {isPending && <ToolSkeleton />}

      {data && (
        <>
          <div className="space-y-1.5">
            <h1 className="font-mono text-lg font-semibold tracking-tight break-all">
              {data.name}
            </h1>
            {data.registry && (
              <p className="text-xs text-muted-foreground">
                First seen {formatTimestamp(data.registry.firstSeenAt)} · last registered{' '}
                {formatRelative(data.registry.lastSeenAt, data.generatedAt)}
                {data.registry.lastChangedAt !== null &&
                  ` · definition changed ${formatRelative(data.registry.lastChangedAt, data.generatedAt)}`}
              </p>
            )}
          </div>

          <StatStrip className="grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
            <StatTile label="Calls" value={data.totals.calls} />
            <StatTile label="Errors" value={data.totals.errors} />
            <ErrorRateTile calls={data.totals.calls} errors={data.totals.errors} />
            <StatTile
              label="Input (est.)"
              value={data.totals.inputTokens}
              hint="Tokens in the tool_use arguments the model wrote to call this tool — counts as the model's output tokens"
            />
            <StatTile
              label="Output (est.)"
              value={data.totals.outputTokens}
              hint="Tokens in the tool result sent back to the model — counts as the model's input tokens on the next turn"
            />
            <StatTile label="Definition (est.)" value={data.registry?.definitionTokens ?? null} />
          </StatStrip>

          <DailyTrendCard byDay={data.byDay} generatedAt={data.generatedAt} />

          <Card>
            <CardHeader>
              <CardTitle>Definition</CardTitle>
              <CardDescription>
                {data.registry
                  ? `As last seen in request bodies — revision ${data.registry.revisions}`
                  : 'No definition captured — this tool was only seen in calls recorded before definition capture'}
              </CardDescription>
            </CardHeader>
            {data.registry && (
              <CardContent className="space-y-3">
                {data.registry.description && (
                  <p className="max-h-60 overflow-y-auto text-xs whitespace-pre-wrap text-secondary-ink">
                    {data.registry.description}
                  </p>
                )}
                {data.registry.inputSchema && (
                  <pre className="max-h-80 overflow-auto rounded-md bg-muted p-3 font-mono text-[11px] leading-relaxed">
                    {prettySchema(data.registry.inputSchema)}
                  </pre>
                )}
              </CardContent>
            )}
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent errors</CardTitle>
              <CardDescription>Latest tool results returned with is_error</CardDescription>
            </CardHeader>
            <CardContent className="p-0 pb-2">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Session</TableHead>
                    <TableHead title="Arguments the model sent to the tool (its output tokens)">
                      Input
                    </TableHead>
                    <TableHead title="Result the tool returned to the model (its input tokens)">
                      Output
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.recentErrors.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={4}
                        className="py-6 text-center text-xs text-muted-foreground"
                      >
                        No errors recorded.
                      </TableCell>
                    </TableRow>
                  ) : (
                    data.recentErrors.map((e) => (
                      <TableRow key={e.id}>
                        <TableCell className="text-xs whitespace-nowrap">
                          {formatTimestamp(e.createdAt)}
                        </TableCell>
                        <TableCell className="text-xs">
                          <Link
                            href={`/sessions/${encodeURIComponent(e.sessionId)}`}
                            className="font-mono text-ring underline-offset-2 hover:underline"
                          >
                            {e.sessionId.slice(0, 8)}
                          </Link>
                        </TableCell>
                        <TableCell className="max-w-64 truncate font-mono text-[11px]" title={e.inputPreview ?? undefined}>
                          {e.inputPreview ?? '—'}
                        </TableCell>
                        <TableCell className="max-w-80 truncate font-mono text-[11px]" title={e.outputPreview ?? undefined}>
                          {e.outputPreview ?? '—'}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}

const ErrorRateTile = ({ calls, errors }: { calls: number; errors: number }) => (
  <div className="bg-card px-4 py-3">
    <div className="truncate text-xs text-muted-foreground">Error rate</div>
    <div className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">
      {calls > 0 ? formatPercent(errors / calls) : '—'}
    </div>
  </div>
)

// Compact daily trend: one bar per UTC day sized by estimated tool tokens
// (input + output — same unit, so the stack is legal), a critical dot marking
// days with errors, exact values in the tooltip.
const TREND_DAYS = 30

const DailyTrendCard = ({ byDay, generatedAt }: { byDay: ToolDayBucket[]; generatedAt: number }) => {
  const [hover, setHover] = useState<number | null>(null)

  const days = useMemo(() => {
    const byKey = new Map(byDay.map((d) => [d.day, d]))
    const end = Date.parse(`${utcDayString(generatedAt)}T00:00:00Z`)
    const out: ToolDayBucket[] = []
    for (let t = end - (TREND_DAYS - 1) * DAY_MS; t <= end; t += DAY_MS) {
      const key = utcDayString(t)
      out.push(byKey.get(key) ?? { day: key, calls: 0, errors: 0, inputTokens: 0, outputTokens: 0 })
    }
    return out
  }, [byDay, generatedAt])

  const maxTokens = Math.max(...days.map((d) => d.inputTokens + d.outputTokens), 1)
  const hovered = hover !== null ? days[hover] : undefined

  return (
    <Card>
      <CardHeader>
        <CardTitle>Daily usage</CardTitle>
        <CardDescription>
          Estimated tool tokens per UTC day over the last {TREND_DAYS} days
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-x-4 gap-y-1 pb-3">
          <span
            className="inline-flex items-center gap-1.5"
            title="tool_use arguments the model wrote — the model's output tokens"
          >
            <span className="h-2.5 w-2.5 rounded-[3px] bg-chart-input" aria-hidden="true" />
            <span className="text-xs text-muted-foreground">Input (model output)</span>
          </span>
          <span
            className="inline-flex items-center gap-1.5"
            title="Tool result sent back to the model — the model's input tokens next turn"
          >
            <span className="h-2.5 w-2.5 rounded-[3px] bg-chart-output" aria-hidden="true" />
            <span className="text-xs text-muted-foreground">Output (model input)</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-status-critical" aria-hidden="true" />
            <span className="text-xs text-muted-foreground">Errors that day</span>
          </span>
        </div>
        <div className="relative" onPointerLeave={() => setHover(null)}>
          <div className="flex h-32 items-end gap-0.5">
            {days.map((d, i) => {
              const total = d.inputTokens + d.outputTokens
              const h = total > 0 ? Math.max(4, (total / maxTokens) * 120) : 0
              const inputShare = total > 0 ? d.inputTokens / total : 0
              return (
                <div
                  key={d.day}
                  tabIndex={0}
                  role="img"
                  aria-label={`${formatUtcDay(d.day, true)}: ${formatInt(d.calls)} calls, ${formatInt(d.errors)} errors, ${formatInt(total)} tokens`}
                  className="relative flex min-w-0 flex-1 flex-col justify-end self-stretch outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onPointerEnter={() => setHover(i)}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover(null)}
                >
                  {d.errors > 0 && (
                    <span
                      className="absolute -top-0.5 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-status-critical"
                      aria-hidden="true"
                    />
                  )}
                  {total > 0 ? (
                    <div
                      className="flex w-full flex-col overflow-hidden rounded-t-[3px]"
                      style={{ height: h, filter: hover === i ? 'brightness(1.12)' : undefined }}
                    >
                      <div className="w-full bg-chart-output" style={{ flex: 1 - inputShare }} />
                      <div className="w-full bg-chart-input" style={{ flex: inputShare }} />
                    </div>
                  ) : (
                    <div className="h-px w-full bg-gridline" />
                  )}
                </div>
              )
            })}
          </div>
          <div className="flex gap-0.5 border-t border-axis pt-1">
            {days.map((d, i) => (
              <span
                key={d.day}
                className="min-w-0 flex-1 text-center text-[10px] text-muted-foreground"
              >
                {i % 5 === 0 ? formatUtcDay(d.day) : ''}
              </span>
            ))}
          </div>
          {hovered && hover !== null && (
            <div
              className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-md border bg-card px-3 py-2 text-xs shadow-md"
              style={{
                left: `${((hover + 0.5) / days.length) * 100}%`,
                top: -4,
              }}
            >
              <div className="pb-1 font-medium whitespace-nowrap">
                {formatUtcDay(hovered.day, true)}
              </div>
              <div className="flex justify-between gap-4 whitespace-nowrap">
                <span className="text-muted-foreground">Calls</span>
                <span className="font-medium tabular-nums">{formatInt(hovered.calls)}</span>
              </div>
              {hovered.errors > 0 && (
                <div className="flex justify-between gap-4 whitespace-nowrap">
                  <span className="text-muted-foreground">Errors</span>
                  <span className="font-medium text-status-critical tabular-nums">
                    {formatInt(hovered.errors)}
                  </span>
                </div>
              )}
              <div className="flex justify-between gap-4 whitespace-nowrap">
                <span className="text-muted-foreground">Input tokens</span>
                <span className="font-medium tabular-nums">{formatInt(hovered.inputTokens)}</span>
              </div>
              <div className="flex justify-between gap-4 whitespace-nowrap">
                <span className="text-muted-foreground">Output tokens</span>
                <span className="font-medium tabular-nums">{formatInt(hovered.outputTokens)}</span>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

const ToolSkeleton = () => (
  <div className="space-y-4">
    <div className="h-6 w-1/2 animate-pulse rounded-md bg-muted/60" />
    <div className="h-24 animate-pulse rounded-lg border bg-muted/60" />
    <div className="h-56 animate-pulse rounded-lg border bg-muted/60" />
    <div className="h-56 animate-pulse rounded-lg border bg-muted/60" />
  </div>
)
