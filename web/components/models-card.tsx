import type { ModelBucket } from '../../shared/api-types'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table'
import { formatInt, formatUsd } from '../lib/format'

export const ModelsCard = ({ byModel }: { byModel: ModelBucket[] }) => (
  <Card>
    <CardHeader>
      <CardTitle>Usage by model</CardTitle>
      <CardDescription>Ordered by input + output tokens · cost from list prices</CardDescription>
    </CardHeader>
    <CardContent className="p-0 pb-2">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Model</TableHead>
            <TableHead className="text-right">Requests</TableHead>
            <TableHead className="text-right">Input</TableHead>
            <TableHead className="text-right">Output</TableHead>
            <TableHead className="text-right">Cache read</TableHead>
            <TableHead className="text-right">Cache write</TableHead>
            <TableHead className="text-right">Est. cost</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {byModel.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="py-6 text-center text-xs text-muted-foreground">
                No requests recorded in this range.
              </TableCell>
            </TableRow>
          ) : (
            byModel.map((m) => (
              <TableRow key={m.model}>
                <TableCell className="font-mono text-xs">{m.model}</TableCell>
                <TableCell className="text-right text-xs tabular-nums">
                  {formatInt(m.requests)}
                </TableCell>
                <TableCell className="text-right text-xs tabular-nums">
                  {formatInt(m.inputTokens)}
                </TableCell>
                <TableCell className="text-right text-xs tabular-nums">
                  {formatInt(m.outputTokens)}
                </TableCell>
                <TableCell className="text-right text-xs tabular-nums">
                  {formatInt(m.cacheReadTokens)}
                </TableCell>
                <TableCell className="text-right text-xs tabular-nums">
                  {formatInt(m.cacheCreationTokens)}
                </TableCell>
                <TableCell className="text-right text-xs font-medium tabular-nums">
                  {formatUsd(m.cost)}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </CardContent>
  </Card>
)
