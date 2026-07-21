import { useMemo, useState } from 'react'
import type { ModelBucket } from '../../../shared/api-types'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table'
import { Badge } from '../../components/ui/badge'
import { Link } from '../../lib/router'
import { cn } from '../../lib/utils'
import { formatInt, formatUsd } from '../../lib/format'

/**
 * Golden example (R7, R8) — match this file for any new sortable/tabular
 * FinOps view. Composed entirely from web/components/ui/table.tsx,
 * web/components/ui/card.tsx, and web/components/ui/badge.tsx; every class
 * below resolves against the @theme block in web/index.css (see
 * .claude/design-system.md). Modeled on the real
 * web/components/models-card.tsx table, extended with client-side sort and
 * a per-row budget-status badge. Sibling to dashboard-card.tsx, the other
 * golden example.
 */

export type CostBreakdownStatus = 'within-budget' | 'near-limit' | 'over-budget'

export type CostBreakdownRow = ModelBucket & { status: CostBreakdownStatus }

const STATUS_STYLE: Record<CostBreakdownStatus, { label: string; className: string }> = {
  'within-budget': { label: 'within budget', className: 'bg-status-good/10 text-status-good' },
  'near-limit': { label: 'near limit', className: 'bg-status-serious/10 text-status-serious' },
  'over-budget': { label: 'over budget', className: 'bg-status-critical/10 text-status-critical' },
}

type SortKey =
  | 'model'
  | 'requests'
  | 'inputTokens'
  | 'outputTokens'
  | 'cacheReadTokens'
  | 'cacheCreationTokens'
  | 'cost'

type SortDirection = 'asc' | 'desc'

interface SortState {
  key: SortKey
  direction: SortDirection
}

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'model', label: 'Model' },
  { key: 'requests', label: 'Requests' },
  { key: 'inputTokens', label: 'Input' },
  { key: 'outputTokens', label: 'Output' },
  { key: 'cacheReadTokens', label: 'Cache read' },
  { key: 'cacheCreationTokens', label: 'Cache write' },
  { key: 'cost', label: 'Est. cost' },
]

const sortValue = (row: CostBreakdownRow, key: SortKey): string | number => {
  switch (key) {
    case 'model':
      return row.model
    case 'cost':
      return row.cost ?? 0
    default:
      return row[key]
  }
}

const compareRows = (a: CostBreakdownRow, b: CostBreakdownRow, key: SortKey): number => {
  const av = sortValue(a, key)
  const bv = sortValue(b, key)
  if (typeof av === 'string' || typeof bv === 'string') {
    return String(av).localeCompare(String(bv))
  }
  return av - bv
}

export interface CostBreakdownTableProps {
  rows: CostBreakdownRow[]
  title?: string
  description?: string
  // Entity-link pattern (.claude/design-system.md): when the leading cell names
  // an entity with its own page, pass its href and the cell renders as an
  // accent link. These rows are not clickable, so the link uses plain
  // hover:underline — group-hover:underline is only for a link that shares a
  // clickable row's own destination.
  getModelHref?: (row: CostBreakdownRow) => string
}

export const CostBreakdownTable = ({
  rows,
  title = 'Cost by model',
  description = 'Ordered by input + output tokens · cost from list prices',
  getModelHref,
}: CostBreakdownTableProps) => {
  const [sort, setSort] = useState<SortState>({ key: 'cost', direction: 'desc' })

  const sorted = useMemo(() => {
    const next = [...rows].sort((a, b) => compareRows(a, b, sort.key))
    return sort.direction === 'asc' ? next : next.reverse()
  }, [rows, sort])

  const toggleSort = (key: SortKey) =>
    setSort((prev) =>
      prev.key === key
        ? { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: 'desc' },
    )

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
              {COLUMNS.map((column) => (
                <TableHead
                  key={column.key}
                  className={cn(column.key !== 'model' && 'text-right')}
                  aria-sort={
                    sort.key === column.key
                      ? sort.direction === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : 'none'
                  }
                >
                  <button
                    type="button"
                    onClick={() => toggleSort(column.key)}
                    className={cn(
                      'inline-flex items-center gap-1 hover:text-foreground',
                      column.key !== 'model' && 'flex-row-reverse',
                    )}
                  >
                    {column.label}
                    <SortIcon active={sort.key === column.key} direction={sort.direction} />
                  </button>
                </TableHead>
              ))}
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={COLUMNS.length + 1}
                  className="py-6 text-center text-xs text-muted-foreground"
                >
                  No requests recorded in this range.
                </TableCell>
              </TableRow>
            ) : (
              sorted.map((row) => {
                const status = STATUS_STYLE[row.status]
                return (
                  <TableRow key={row.model}>
                    <TableCell className="font-mono text-xs">
                      {getModelHref ? (
                        <Link
                          href={getModelHref(row)}
                          className="text-ring underline-offset-2 hover:underline"
                        >
                          {row.model}
                        </Link>
                      ) : (
                        row.model
                      )}
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums">
                      {formatInt(row.requests)}
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums">
                      {formatInt(row.inputTokens)}
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums">
                      {formatInt(row.outputTokens)}
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums">
                      {formatInt(row.cacheReadTokens)}
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums">
                      {formatInt(row.cacheCreationTokens)}
                    </TableCell>
                    <TableCell className="text-right text-xs font-medium tabular-nums">
                      {formatUsd(row.cost)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={status.className}>
                        {status.label}
                      </Badge>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

const SortIcon = ({ active, direction }: { active: boolean; direction: SortDirection }) => (
  <svg
    width="8"
    height="8"
    viewBox="0 0 8 8"
    aria-hidden="true"
    className={cn('shrink-0 transition-transform', active && direction === 'asc' && 'rotate-180')}
  >
    <path
      d="M1 3 4 6 7 3"
      stroke="currentColor"
      strokeWidth="1.3"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={active ? 'opacity-100' : 'opacity-30'}
    />
  </svg>
)
