import { useState } from 'react'
import type { ToolBucket } from '../../shared/api-types'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table'
import { Button } from './ui/button'
import { formatInt, formatPercent } from '../lib/format'

interface ToolsCardProps {
  tools: ToolBucket[]
  description: string
}

export const ToolsCard = ({ tools, description }: ToolsCardProps) => {
  const [showUnused, setShowUnused] = useState(false)
  const totalTokens = tools.reduce((sum, t) => sum + t.inputTokens + t.outputTokens, 0)
  const usedTools = tools.filter((t) => t.calls > 0)
  const unusedTools = tools.filter((t) => t.calls === 0)
  const visibleTools = showUnused ? tools : usedTools
  return (
    <Card>
      <CardHeader>
        <CardTitle>Usage by tool</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="p-0 pb-2">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tool</TableHead>
              <TableHead className="text-right">Calls</TableHead>
              <TableHead className="text-right">Errors</TableHead>
              <TableHead className="text-right">Pending</TableHead>
              <TableHead
                className="text-right"
                title="Estimated tokens in the tool_use arguments the model wrote to call the tool — counts as the model's output tokens"
              >
                Input (model output)
              </TableHead>
              <TableHead
                className="text-right"
                title="Estimated tokens in the tool result sent back to the model — counts as the model's input tokens on the next turn"
              >
                Output (model input)
              </TableHead>
              <TableHead className="text-right">Share</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tools.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-6 text-center text-xs text-muted-foreground">
                  No tool calls recorded.
                </TableCell>
              </TableRow>
            ) : (
              visibleTools.map((t) => (
                <TableRow key={t.func}>
                  <TableCell className="font-mono text-xs">{t.func}</TableCell>
                  <TableCell className="text-right text-xs tabular-nums">
                    {formatInt(t.calls)}
                  </TableCell>
                  <TableCell className="text-right text-xs tabular-nums">
                    {t.errors > 0 ? formatInt(t.errors) : '—'}
                  </TableCell>
                  <TableCell className="text-right text-xs tabular-nums">
                    {t.pending > 0 ? formatInt(t.pending) : '—'}
                  </TableCell>
                  <TableCell className="text-right text-xs tabular-nums">
                    {formatInt(t.inputTokens)}
                  </TableCell>
                  <TableCell className="text-right text-xs tabular-nums">
                    {formatInt(t.outputTokens)}
                  </TableCell>
                  <TableCell className="text-right text-xs tabular-nums text-muted-foreground">
                    {totalTokens > 0
                      ? formatPercent((t.inputTokens + t.outputTokens) / totalTokens)
                      : '—'}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        {unusedTools.length > 0 && (
          <div className="flex justify-center pt-2">
            <Button variant="ghost" onClick={() => setShowUnused((v) => !v)}>
              {showUnused
                ? 'Hide unused tools'
                : `Show ${unusedTools.length} unused tool${unusedTools.length === 1 ? '' : 's'}`}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
