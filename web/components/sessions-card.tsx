import { useState } from 'react'
import type { SessionSummary } from '../../shared/api-types'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Checkbox } from './ui/checkbox'
import { Link, useRouter } from '../lib/router'
import { formatInt, formatRelative, formatTimestamp, formatUsd } from '../lib/format'

interface SessionsCardProps {
  sessions: SessionSummary[]
  generatedAt: number
  // Whether to show the System column. Hidden on the system page, where every
  // row already belongs to the same system.
  showSystem?: boolean
  // System-page only: enables the pick-two-rows → Compare flow. All rows on
  // that page share one system, which compare mode requires.
  compareSystemId?: string
}

const isModifiedClick = (e: { metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean; button: number }) =>
  e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0

export const SessionsCard = ({
  sessions,
  generatedAt,
  showSystem = true,
  compareSystemId,
}: SessionsCardProps) => {
  const { navigate } = useRouter()
  const selectable = compareSystemId !== undefined
  const [selected, setSelected] = useState<string[]>([])

  const toggle = (id: string) =>
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : prev.length < 2 ? [...prev, id] : prev,
    )

  const startCompare = () => {
    if (!compareSystemId || selected.length !== 2) return
    // Older run becomes the baseline (A).
    const [first, second] = [...selected].sort((x, y) => {
      const sx = sessions.find((s) => s.id === x)?.createdAt ?? 0
      const sy = sessions.find((s) => s.id === y)?.createdAt ?? 0
      return sx - sy
    })
    navigate(
      `/systems/${encodeURIComponent(compareSystemId)}/compare?a=${encodeURIComponent(first!)}&b=${encodeURIComponent(second!)}`,
    )
  }

  const columnCount = (showSystem ? 12 : 11) + (selectable ? 1 : 0)

  return (
  <Card>
    <CardHeader className="flex-row flex-wrap items-start justify-between gap-2">
      <div className="flex flex-col gap-1">
        <CardTitle>Sessions</CardTitle>
        <CardDescription>
          Conversations grouped by the proxy, most recently active first (latest 50) — click a row
          to drill into its tools and requests
          {selectable && ', or check two runs to compare them'}
        </CardDescription>
      </div>
      {selectable && (
        <Button variant="outline" disabled={selected.length !== 2} onClick={startCompare}>
          Compare{selected.length > 0 ? ` (${selected.length}/2)` : ''}
        </Button>
      )}
    </CardHeader>
    <CardContent className="p-0 pb-2">
      <Table>
        <TableHeader>
          <TableRow>
            {selectable && <TableHead className="w-8" aria-label="Select for compare" />}
            <TableHead>Session</TableHead>
            {showSystem && <TableHead>System</TableHead>}
            <TableHead>Provider</TableHead>
            <TableHead>Source</TableHead>
            <TableHead className="text-right">Requests</TableHead>
            <TableHead className="text-right">Input</TableHead>
            <TableHead className="text-right">Output</TableHead>
            <TableHead className="text-right">Cache read</TableHead>
            <TableHead className="text-right">Cache write</TableHead>
            <TableHead className="text-right">Est. cost</TableHead>
            <TableHead className="text-right">Last seen</TableHead>
            <TableHead className="w-4" aria-label="Open session" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {sessions.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={columnCount}
                className="py-6 text-center text-xs text-muted-foreground"
              >
                No sessions recorded in this range.
              </TableCell>
            </TableRow>
          ) : (
            sessions.map((s) => (
              <TableRow
                key={s.id}
                onClick={(e) => {
                  if (isModifiedClick(e)) return
                  navigate(`/sessions/${encodeURIComponent(s.id)}`)
                }}
                className="group cursor-pointer"
              >
                {selectable && (
                  <TableCell className="pr-0" onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={selected.includes(s.id)}
                      disabled={selected.length === 2 && !selected.includes(s.id)}
                      onCheckedChange={() => toggle(s.id)}
                      aria-label={`Select ${s.name ?? s.id.slice(0, 8)} for compare`}
                    />
                  </TableCell>
                )}
                <TableCell>
                  <Link
                    href={`/sessions/${encodeURIComponent(s.id)}`}
                    onClick={(e) => e.stopPropagation()}
                    className={
                      s.name
                        ? 'block max-w-[20rem] truncate text-xs font-medium text-ring underline-offset-2 group-hover:underline'
                        : 'font-mono text-xs font-medium text-ring underline-offset-2 group-hover:underline'
                    }
                    title={s.name ? `${s.name}\n${s.id}` : s.id}
                  >
                    {s.name ?? s.id.slice(0, 8)}
                  </Link>
                </TableCell>
                {showSystem && (
                  <TableCell>
                    <Link
                      href={`/systems/${encodeURIComponent(s.systemId)}`}
                      onClick={(e) => e.stopPropagation()}
                      className="text-xs font-medium text-ring underline-offset-2 hover:underline"
                      title={s.systemId}
                    >
                      {s.systemName}
                    </Link>
                  </TableCell>
                )}
                <TableCell className="text-xs">{s.providerId}</TableCell>
                <TableCell>
                  <Badge variant={s.source === 'metadata' ? 'secondary' : 'outline'}>
                    {s.source}
                  </Badge>
                </TableCell>
                <TableCell className="text-right text-xs tabular-nums">
                  {formatInt(s.requests)}
                </TableCell>
                <TableCell className="text-right text-xs tabular-nums">
                  {formatInt(s.inputTokens)}
                </TableCell>
                <TableCell className="text-right text-xs tabular-nums">
                  {formatInt(s.outputTokens)}
                </TableCell>
                <TableCell className="text-right text-xs tabular-nums">
                  {formatInt(s.cacheReadTokens)}
                </TableCell>
                <TableCell className="text-right text-xs tabular-nums">
                  {formatInt(s.cacheCreationTokens)}
                </TableCell>
                <TableCell className="text-right text-xs font-medium tabular-nums">
                  {formatUsd(s.cost)}
                </TableCell>
                <TableCell
                  className="text-right text-xs whitespace-nowrap text-muted-foreground"
                  title={formatTimestamp(s.lastSeenAt)}
                >
                  {formatRelative(s.lastSeenAt, generatedAt)}
                </TableCell>
                <TableCell className="pr-3 pl-0 text-right">
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 16 16"
                    aria-hidden="true"
                    className="inline-block text-muted-foreground/40 transition-colors group-hover:text-foreground"
                  >
                    <path
                      d="M6 3.5 10.5 8 6 12.5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </CardContent>
  </Card>
  )
}
