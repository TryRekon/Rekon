import type { RequestSummary } from '../../shared/api-types'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table'
import { Badge } from './ui/badge'
import { Link } from '../lib/router'
import { formatInt, formatTimestamp } from '../lib/format'

const statusColor = (status: number): string => {
  if (status >= 500) return 'var(--status-critical)'
  if (status >= 400) return 'var(--status-serious)'
  return 'var(--status-good)'
}

interface RequestsCardProps {
  requests: RequestSummary[]
  title?: string
  description?: string
  showSession?: boolean
  showNewInput?: boolean
}

export const RequestsCard = ({
  requests,
  title = 'Recent requests',
  description = 'Latest 25 proxied requests in this range',
  showSession = false,
  showNewInput = false,
}: RequestsCardProps) => {
  const columnCount = 8 + (showSession ? 1 : 0) + (showNewInput ? 1 : 0)
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="p-0 pb-2">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Time</TableHead>
              <TableHead>Request</TableHead>
              <TableHead>Model</TableHead>
              <TableHead>Status</TableHead>
              {showNewInput && (
                <TableHead
                  className="text-right"
                  title="Tokens this request added to the conversation vs its parent turn"
                >
                  New input
                </TableHead>
              )}
              <TableHead className="text-right">Input</TableHead>
              <TableHead className="text-right">Output</TableHead>
              <TableHead className="text-right">Cache read</TableHead>
              <TableHead className="text-right">Cache write</TableHead>
              {showSession && <TableHead>Session</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {requests.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columnCount}
                  className="py-6 text-center text-xs text-muted-foreground"
                >
                  No requests recorded.
                </TableCell>
              </TableRow>
            ) : (
              requests.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-xs whitespace-nowrap text-muted-foreground">
                    {formatTimestamp(r.createdAt)}
                  </TableCell>
                  <TableCell>
                    <span
                      className="block max-w-44 truncate font-mono text-xs"
                      title={`${r.method} ${r.path}`}
                    >
                      {r.method} {r.path}
                    </span>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{r.model ?? '—'}</TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-1.5 text-xs tabular-nums">
                      <span
                        className="inline-block h-1.5 w-1.5 rounded-full"
                        style={{ backgroundColor: statusColor(r.status) }}
                        aria-hidden="true"
                      />
                      {r.status}
                      {r.streaming && (
                        <Badge variant="outline" className="ml-1">
                          stream
                        </Badge>
                      )}
                    </span>
                  </TableCell>
                  {showNewInput && (
                    <TableCell className="text-right text-xs tabular-nums">
                      {formatInt(r.newInputTokens)}
                    </TableCell>
                  )}
                  <TableCell className="text-right text-xs tabular-nums">
                    {formatInt(r.inputTokens)}
                  </TableCell>
                  <TableCell className="text-right text-xs tabular-nums">
                    {formatInt(r.outputTokens)}
                  </TableCell>
                  <TableCell className="text-right text-xs tabular-nums">
                    {formatInt(r.cacheReadTokens)}
                  </TableCell>
                  <TableCell className="text-right text-xs tabular-nums">
                    {formatInt(r.cacheCreationTokens)}
                  </TableCell>
                  {showSession && (
                    <TableCell>
                      {r.sessionId ? (
                        <Link
                          href={`/sessions/${encodeURIComponent(r.sessionId)}`}
                          className="font-mono text-xs text-ring underline-offset-2 hover:underline"
                          title={r.sessionId}
                        >
                          {r.sessionId.slice(0, 8)}
                        </Link>
                      ) : (
                        <span className="font-mono text-xs">—</span>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
