import type { ToolDiffRow } from '../../lib/compare'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table'
import { Badge } from '../ui/badge'
import { formatCompact, formatInt } from '../../lib/format'
import { cn } from '../../lib/utils'

const cell = (row: ToolDiffRow, side: 'a' | 'b'): string => {
  const bucket = row[side]
  if (!bucket) {
    // Defined in this run's toolset but never invoked.
    if (side === 'b' && row.neverCalled) return '0 · —'
    return '—'
  }
  return `${formatInt(bucket.calls)} · ${formatCompact(bucket.inputTokens + bucket.outputTokens)}`
}

const StatusBadge = ({ row }: { row: ToolDiffRow }) => {
  if (row.status === 'added' && row.neverCalled) {
    return <Badge className="bg-status-serious/15 text-status-serious">added · never called</Badge>
  }
  if (row.status === 'added') return <Badge className="bg-status-good/10 text-status-good">added</Badge>
  if (row.status === 'removed') return <Badge variant="outline">removed</Badge>
  if (row.status === 'redefined') return <Badge className="bg-ring/10 text-ring">redefined</Badge>
  return null
}

export const ToolDiffCard = ({ rows }: { rows: ToolDiffRow[] }) => {
  const netDelta = rows.reduce((sum, r) => sum + r.deltaTokens, 0)
  const maxAbs = Math.max(...rows.map((r) => Math.abs(r.deltaTokens)), 1)
  const neverCalled = rows.filter((r) => r.neverCalled && r.status === 'added')

  return (
    <Card>
      <CardHeader>
        <CardTitle>What drove it</CardTitle>
        <CardDescription>
          Tool tokens per tool (calls · input+result), sorted by impact — token counts are
          estimates scaled to each turn's measured delta
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0 pb-2">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tool</TableHead>
              <TableHead className="text-right">Run A</TableHead>
              <TableHead className="text-right">Run B</TableHead>
              <TableHead className="text-right">Change</TableHead>
              <TableHead className="hidden w-28 sm:table-cell" aria-hidden="true" />
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-6 text-center text-xs text-muted-foreground">
                  Neither run called any tools.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.func} className="hover:bg-transparent">
                  <TableCell className="font-mono text-xs font-medium">{row.func}</TableCell>
                  <TableCell className="text-right text-xs tabular-nums text-muted-foreground">
                    {cell(row, 'a')}
                  </TableCell>
                  <TableCell className="text-right text-xs font-medium tabular-nums">
                    {cell(row, 'b')}
                  </TableCell>
                  <TableCell className="text-right text-xs font-medium tabular-nums">
                    {row.deltaTokens === 0 ? (
                      <span className="font-normal text-muted-foreground">—</span>
                    ) : (
                      <span
                        className={row.deltaTokens < 0 ? 'text-status-good' : 'text-status-critical'}
                      >
                        {row.deltaTokens > 0 ? '+' : '−'}
                        {formatCompact(Math.abs(row.deltaTokens))}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn(
                          'h-full rounded-full',
                          row.deltaTokens < 0 ? 'bg-status-good/70' : 'bg-status-critical/60',
                        )}
                        style={{ width: `${(Math.abs(row.deltaTokens) / maxAbs) * 100}%` }}
                      />
                    </div>
                  </TableCell>
                  <TableCell className="pr-4 text-right">
                    <StatusBadge row={row} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        {rows.length > 0 && (
          <p className="px-4 pt-2 text-xs text-muted-foreground">
            Net tool-token change:{' '}
            <span
              className={cn(
                'font-medium tabular-nums',
                netDelta < 0 ? 'text-status-good' : netDelta > 0 ? 'text-status-critical' : '',
              )}
            >
              {netDelta === 0 ? '±0' : `${netDelta > 0 ? '+' : '−'}${formatCompact(Math.abs(netDelta))}`}{' '}
              tokens
            </span>
            {neverCalled.length > 0 && (
              <>
                {' · '}
                <span className="font-mono">{neverCalled.map((r) => r.func).join(', ')}</span>{' '}
                {neverCalled.length === 1 ? 'was' : 'were'} added in Run B but the model never
                invoked {neverCalled.length === 1 ? 'it' : 'them'}
              </>
            )}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
