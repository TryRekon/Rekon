import type { ReactNode } from 'react'
import { cn } from '../lib/utils'
import { formatCompact, formatInt, formatUsd } from '../lib/format'

// One shared frame for a page's stat cells, separated by hairlines (the
// gap-px trick keeps dividers correct at every wrap point).
export const StatStrip = ({ className, children }: { className?: string; children: ReactNode }) => (
  <div className="overflow-hidden rounded-lg border bg-border shadow-2xs">
    <div className={cn('grid gap-px', className)}>{children}</div>
  </div>
)

interface StatTileProps {
  label: string
  value: number | null
  format?: 'count' | 'usd'
  hint?: string
}

export const StatTile = ({ label, value, format = 'count', hint }: StatTileProps) => {
  const display = value === null ? '—' : format === 'usd' ? formatUsd(value) : formatCompact(value)
  const full =
    value === null ? undefined : format === 'usd' ? `$${value.toFixed(4)}` : formatInt(value)
  return (
    <div className="bg-card px-4 py-3">
      <div className="truncate text-xs text-muted-foreground" title={hint ?? label}>
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold tracking-tight tabular-nums" title={full}>
        {display}
      </div>
    </div>
  )
}
