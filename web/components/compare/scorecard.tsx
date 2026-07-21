import type { ChangeTone, ScoreRow } from '../../lib/compare'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table'
import { formatCompact, formatDuration, formatInt, formatPercent, formatUsd } from '../../lib/format'
import { cn } from '../../lib/utils'

interface ScorecardProps {
  rows: ScoreRow[]
  hitRates: { a: number | null; b: number | null }
  crossProvider: boolean
  aLabel: string
  bLabel: string
}

const formatValue = (value: number | null, format: ScoreRow['format']): string => {
  if (value === null) return '—'
  if (format === 'usd') return formatUsd(value)
  if (format === 'duration') return formatDuration(value)
  return formatCompact(value)
}

const formatDelta = (delta: number, format: ScoreRow['format']): string => {
  const sign = delta > 0 ? '+' : '−'
  const abs = Math.abs(delta)
  if (format === 'usd') return `${sign}${formatUsd(abs)}`
  if (format === 'duration') return `${sign}${formatDuration(abs)}`
  return `${sign}${formatCompact(abs)}`
}

const toneClass: Record<ChangeTone, string> = {
  good: 'text-status-good',
  bad: 'text-status-critical',
  neutral: 'text-muted-foreground',
}

export const RunLegend = ({ aLabel, bLabel }: { aLabel: string; bLabel: string }) => (
  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-secondary-ink">
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-[3px] bg-run-a" aria-hidden="true" />
      {aLabel}
    </span>
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-[3px] bg-run-b" aria-hidden="true" />
      {bLabel}
    </span>
  </div>
)

export const ScorecardCard = ({ rows, hitRates, crossProvider, aLabel, bLabel }: ScorecardProps) => {
  const hitDelta =
    hitRates.a !== null && hitRates.b !== null ? hitRates.b - hitRates.a : null

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-baseline justify-between gap-2">
        <div className="flex flex-col gap-1">
          <CardTitle>Did it help</CardTitle>
          <CardDescription>Totals per run · change shown as B relative to A</CardDescription>
        </div>
        <RunLegend aLabel={aLabel} bLabel={bLabel} />
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Metric</TableHead>
              <TableHead className="text-right">Run A</TableHead>
              <TableHead className="text-right">Run B</TableHead>
              <TableHead className="text-right">Change</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.key} className="hover:bg-transparent">
                <TableCell className="text-xs text-secondary-ink">
                  {row.label}
                  {crossProvider && row.format === 'count' && row.key !== 'turns' && (
                    <span className="text-muted-foreground"> *</span>
                  )}
                </TableCell>
                <TableCell
                  className="text-right text-xs tabular-nums text-muted-foreground"
                  title={row.format === 'count' ? formatInt(row.a) : undefined}
                >
                  {formatValue(row.a, row.format)}
                </TableCell>
                <TableCell
                  className="text-right text-xs font-medium tabular-nums"
                  title={row.format === 'count' ? formatInt(row.b) : undefined}
                >
                  {formatValue(row.b, row.format)}
                </TableCell>
                <TableCell className="text-right text-xs tabular-nums">
                  {row.delta === null || row.delta === 0 ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    <span className={cn('font-medium', toneClass[row.tone])}>
                      {formatDelta(row.delta, row.format)}
                      {row.pct !== null && (
                        <span className="pl-1.5 font-normal text-muted-foreground">
                          {row.pct > 0 ? '+' : '−'}
                          {formatPercent(Math.abs(row.pct))}
                        </span>
                      )}
                    </span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {hitRates.a !== null && hitRates.b !== null && hitDelta !== null && (
          <div
            className={cn(
              'mt-3 flex items-center gap-2 rounded-md px-3 py-2 text-xs',
              hitDelta > 0.005
                ? 'bg-status-good/10 text-status-good'
                : hitDelta < -0.005
                  ? 'bg-status-serious/15 text-status-serious'
                  : 'bg-muted text-muted-foreground',
            )}
          >
            <span aria-hidden="true">{hitDelta > 0.005 ? '✓' : hitDelta < -0.005 ? '▲' : '·'}</span>
            <span className="text-secondary-ink">
              Cache hit rate {hitDelta > 0.005 ? 'improved' : hitDelta < -0.005 ? 'regressed' : 'held'} —{' '}
              <span className="font-semibold text-foreground tabular-nums">
                {formatPercent(hitRates.a)} → {formatPercent(hitRates.b)}
              </span>{' '}
              of prompt tokens served from cache.
            </span>
          </div>
        )}

        {crossProvider && (
          <p className="mt-2 text-xs text-muted-foreground">
            * The runs used different providers — tokenizers differ, so token counts aren't
            directly comparable. Cost is the comparable number.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
