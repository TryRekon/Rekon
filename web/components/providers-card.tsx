import type { ProviderSummary } from '../../shared/api-types'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table'
import { Badge } from './ui/badge'
import { formatInt } from '../lib/format'

export const ProvidersCard = ({ providers }: { providers: ProviderSummary[] }) => (
  <Card>
    <CardHeader>
      <CardTitle>Providers</CardTitle>
      <CardDescription>Upstream APIs profiled by this proxy</CardDescription>
    </CardHeader>
    <CardContent className="p-0 pb-2">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Provider</TableHead>
            <TableHead className="text-right">Sessions</TableHead>
            <TableHead className="text-right">Requests</TableHead>
            <TableHead className="text-right">Tokens in / out</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {providers.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4} className="py-6 text-center text-xs text-muted-foreground">
                No providers registered.
              </TableCell>
            </TableRow>
          ) : (
            providers.map((p) => (
              <TableRow key={p.id}>
                <TableCell>
                  <span className="text-xs font-medium">{p.name}</span>{' '}
                  <Badge variant="outline" className="ml-1 font-mono">
                    {p.id}
                  </Badge>
                </TableCell>
                <TableCell className="text-right text-xs tabular-nums">
                  {formatInt(p.sessions)}
                </TableCell>
                <TableCell className="text-right text-xs tabular-nums">
                  {formatInt(p.requests)}
                </TableCell>
                <TableCell className="text-right text-xs whitespace-nowrap tabular-nums">
                  {formatInt(p.inputTokens)} / {formatInt(p.outputTokens)}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </CardContent>
  </Card>
)
