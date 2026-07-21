import type { SystemSummary } from '../../shared/api-types'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table'
import { Link } from '../lib/router'
import { formatInt, formatRelative, formatTimestamp, formatUsd } from '../lib/format'

interface SystemsCardProps {
  systems: SystemSummary[]
  generatedAt: number
}

export const SystemsCard = ({ systems, generatedAt }: SystemsCardProps) => (
  <Card>
    <CardHeader>
      <CardTitle>Systems</CardTitle>
      <CardDescription>
        Each system groups the traffic sent through its proxy URL (…/s/&lt;uuid&gt;) — click a
        system to see its aggregate usage, tool registry, and the sessions within it
      </CardDescription>
    </CardHeader>
    <CardContent className="p-0 pb-2">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>System</TableHead>
            <TableHead className="text-right">Sessions</TableHead>
            <TableHead className="text-right">Requests</TableHead>
            <TableHead className="text-right">Input</TableHead>
            <TableHead className="text-right">Output</TableHead>
            <TableHead className="text-right">Cache read</TableHead>
            <TableHead className="text-right">Cache write</TableHead>
            <TableHead className="text-right">Est. cost</TableHead>
            <TableHead className="text-right">Last seen</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {systems.length === 0 ? (
            <TableRow>
              <TableCell colSpan={9} className="py-6 text-center text-xs text-muted-foreground">
                No system activity in this range.
              </TableCell>
            </TableRow>
          ) : (
            systems.map((s) => (
              <TableRow key={s.id}>
                <TableCell>
                  <Link
                    href={`/systems/${encodeURIComponent(s.id)}`}
                    className="text-xs font-medium text-ring underline-offset-2 hover:underline"
                    title={s.name}
                  >
                    {s.name}
                  </Link>
                </TableCell>
                <TableCell className="text-right text-xs tabular-nums">
                  {formatInt(s.sessions)}
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
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </CardContent>
  </Card>
)
