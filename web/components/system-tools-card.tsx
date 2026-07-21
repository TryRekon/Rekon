import { useState } from 'react'
import type { SystemTool } from '../../shared/api-types'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Link } from '../lib/router'
import { formatInt, formatPercent } from '../lib/format'

const CHANGED_WINDOW_MS = 7 * 86_400_000

interface SystemToolsCardProps {
  systemId: string
  tools: SystemTool[]
  generatedAt: number
}

export const SystemToolsCard = ({ systemId, tools, generatedAt }: SystemToolsCardProps) => {
  const [showUnused, setShowUnused] = useState(false)
  const totalTokens = tools.reduce((sum, t) => sum + t.inputTokens + t.outputTokens, 0)
  const usedTools = tools.filter((t) => t.calls > 0)
  const unusedTools = tools.filter((t) => t.calls === 0)
  const visibleTools = showUnused ? tools : usedTools
  return (
    <Card>
      <CardHeader>
        <CardTitle>Tools</CardTitle>
        <CardDescription>
          Definitions remembered from this system's requests, merged with call activity — def.
          tokens is the estimated prompt cost of the definition, revisions counts definition
          changes
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0 pb-2">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tool</TableHead>
              <TableHead className="text-right">Calls</TableHead>
              <TableHead className="text-right">Errors</TableHead>
              <TableHead
                className="text-right"
                title="Estimated tokens the tool definition adds to every request prompt"
              >
                Def. tokens
              </TableHead>
              <TableHead className="text-right" title="Times the definition changed">
                Revisions
              </TableHead>
              <TableHead
                className="text-right"
                title="Estimated tokens in the tool_use arguments the model wrote to call this tool — counts as the model's output tokens"
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
                <TableCell colSpan={8} className="py-6 text-center text-xs text-muted-foreground">
                  No tools recorded for this system yet.
                </TableCell>
              </TableRow>
            ) : (
              visibleTools.map((t) => {
                const unused = t.calls === 0
                const changedRecently =
                  t.lastChangedAt !== null && generatedAt - t.lastChangedAt < CHANGED_WINDOW_MS
                return (
                  <TableRow key={t.func}>
                    <TableCell>
                      <span className="inline-flex items-center gap-1.5">
                        <Link
                          href={`/systems/${encodeURIComponent(systemId)}/tools/${encodeURIComponent(t.func)}`}
                          className="font-mono text-xs text-ring underline-offset-2 hover:underline"
                          title={t.description ?? undefined}
                        >
                          {t.func}
                        </Link>
                        {unused && (
                          <Badge variant="outline" title="Defined in requests but never invoked">
                            unused
                          </Badge>
                        )}
                        {changedRecently && (
                          <Badge title="Definition changed within the last 7 days">changed</Badge>
                        )}
                      </span>
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums">
                      {formatInt(t.calls)}
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums">
                      {t.errors > 0 ? formatInt(t.errors) : '—'}
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums">
                      {formatInt(t.definitionTokens)}
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums">
                      {t.revisions !== null && t.revisions > 1 ? formatInt(t.revisions) : '—'}
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
                )
              })
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
