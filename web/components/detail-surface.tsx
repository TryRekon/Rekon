import type { ReactNode } from 'react'
import { cn } from '../lib/utils'

/**
 * detail-surface — the single-surface primitives shared by the System and
 * Session detail pages (system.tsx / session.tsx), the direct siblings of the
 * dashboard's edge-to-edge frame (see web/pages/dashboard.tsx +
 * web/components/attribution-columns.tsx, the 1:1 warm-artifact rebuild).
 *
 * Same idiom: ONE `rounded-lg border bg-card` surface whose regions are split
 * by hairline rules — no per-section cards, gaps, or shadows. Dense grids draw
 * their dividers with a 1px grid gap over a `bg-hairline` ground (cells are
 * `bg-card`), which is correct at any column/row count with no nth-child
 * arithmetic (the technique the dashboard's KPI row settled on). The table
 * primitives mirror attribution-columns' `thClass`/`tdBase`/`numCell`/`RowBar`
 * so both detail pages read as one system with the dashboard. They are a
 * deliberate local copy, not an import from attribution-columns: that module
 * ships in the already-merged dashboard with private primitives, so routing it
 * through here would restyle a shipped surface. `ColHeader` intentionally uses
 * `font-sans` — this artifact's column headers are Switzer `.lbl`, not mono.
 */

// ── Surface shell ──────────────────────────────────────────────────────────

export const Surface = ({ children, className }: { children: ReactNode; className?: string }) => (
  <div className={cn('overflow-hidden rounded-lg border bg-card', className)}>{children}</div>
)

// A hairline-closed region. `flush` drops the bottom rule for the last region.
export const Region = ({
  children,
  className,
  flush,
}: {
  children: ReactNode
  className?: string
  flush?: boolean
}) => <div className={cn(!flush && 'border-b border-border', className)}>{children}</div>

// ── Header (shead): title + meta line + status pill ─────────────────────────

export const StatusPill = ({
  tone = 'good',
  children,
}: {
  tone?: 'good' | 'serious'
  children: ReactNode
}) => (
  <span
    className={cn(
      'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold',
      tone === 'good'
        ? 'border-status-good/35 bg-status-good/10 text-status-good'
        : 'border-status-serious/35 bg-status-serious/10 text-status-serious',
    )}
  >
    <span
      className={cn(
        'inline-block h-1.5 w-1.5 rounded-full',
        tone === 'good' ? 'bg-status-good' : 'animate-pulse bg-status-serious',
      )}
    />
    {children}
  </span>
)

// One `label value` pair in the header meta line. Values are ink; labels muted.
export const MetaItem = ({ label, children }: { label: string; children: ReactNode }) => (
  <span className="text-secondary-ink">
    {label} <span className="font-medium text-foreground">{children}</span>
  </span>
)

export const DetailHeader = ({
  title,
  meta,
  pill,
}: {
  title: ReactNode
  meta: ReactNode
  pill?: ReactNode
}) => (
  <Region className="flex items-start justify-between gap-4 px-4 py-3.5 md:px-6">
    <div className="min-w-0">
      {title}
      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px]">{meta}</div>
    </div>
    {pill}
  </Region>
)

// ── Glance strip (gstrip): a spend hero + up to four flat KPI cells ─────────

interface GlanceCell {
  label: string
  value: ReactNode
}

// Splits a USD amount into a whole-dollar head and a de-emphasized cents tail
// for the hero figure ($412 + .33), matching the artifact's two-weight numeral.
// Round to integer cents FIRST, then split — rounding the fraction alone lets a
// value like 4.999 render "$4.100" instead of carrying into "$5.00".
const splitUsd = (n: number | null): { whole: string; cents: string } => {
  if (n === null) return { whole: '—', cents: '' }
  const cents = Math.round(Math.abs(n) * 100)
  const sign = n < 0 ? '-' : ''
  return {
    whole: `${sign}$${new Intl.NumberFormat('en-US').format(Math.trunc(cents / 100))}`,
    cents: `.${String(cents % 100).padStart(2, '0')}`,
  }
}

export const GlanceStrip = ({
  eyebrow,
  amount,
  pace,
  cells,
}: {
  eyebrow: string
  amount: number | null
  pace: ReactNode
  cells: GlanceCell[]
}) => {
  const { whole, cents } = splitUsd(amount)
  return (
    // gap-px hairline ground; the hero spans full width until the row can fit
    // it beside the four cells (lg), matching the artifact's `auto repeat(4,1fr)`.
    <div className="grid grid-cols-2 gap-px border-b border-border bg-hairline sm:grid-cols-4 lg:grid-cols-[minmax(220px,auto)_repeat(4,1fr)]">
      <div className="col-span-2 bg-card px-6 py-5 sm:col-span-4 lg:col-span-1">
        <span className="text-[10px] font-semibold tracking-[0.16em] uppercase text-muted-foreground">
          {eyebrow}
        </span>
        <div className="mt-3 mb-2 font-mono text-[52px] leading-none font-medium tracking-[-0.03em] text-foreground">
          {whole}
          <span className="text-[26px] text-secondary-ink">{cents}</span>
        </div>
        <div className="text-[13px] text-secondary-ink">{pace}</div>
      </div>
      {cells.map((c) => (
        <div key={c.label} className="bg-card px-[18px] py-5">
          <span className="text-[9.5px] font-semibold tracking-[0.15em] uppercase text-muted-foreground">
            {c.label}
          </span>
          <div className="mt-1.5 font-mono text-[20px] leading-tight font-medium tabular-nums text-foreground">
            {c.value}
          </div>
        </div>
      ))}
    </div>
  )
}

// A compact unit suffix for a KPI value (the artifact's `<small>` — 4.9<small>M</small>).
export const Unit = ({ children }: { children: ReactNode }) => (
  <small className="text-[11px] font-normal text-muted-foreground">{children}</small>
)

// ── Dense table primitives (mirror of attribution-columns) ──────────────────

const thClass = (align: 'text-left' | 'text-right') =>
  cn(
    'border-b border-hairline px-4 pt-2.5 pb-1.5 font-sans text-[9px] font-semibold tracking-[0.13em] uppercase text-muted-foreground md:px-[18px]',
    align,
  )

export const Th = ({ children, right }: { children?: ReactNode; right?: boolean }) => (
  <th className={thClass(right ? 'text-right' : 'text-left')}>{children}</th>
)

export const tdBase = 'border-b border-hairline px-4 py-2 align-top md:px-[18px]'
export const numCell = cn(tdBase, 'text-right font-mono tabular-nums')

export const RowBar = ({ pct, color }: { pct: number; color?: string }) => (
  <div className="mt-[5px] h-[3px] overflow-hidden rounded-[2px] bg-muted">
    <div
      className="h-full"
      style={{ width: `${Math.max(0, Math.min(100, pct))}%`, backgroundColor: color ?? 'var(--ring)' }}
    />
  </div>
)

export const EmptyRow = ({ colSpan, children }: { colSpan: number; children: ReactNode }) => (
  <tr>
    <td colSpan={colSpan} className={cn(tdBase, 'text-center text-muted-foreground')}>
      {children}
    </td>
  </tr>
)

// Name-cell link: break-words + underline-offset per the design-system recipe;
// min-w-0 on the owning column lets tracks honor their fr proportions.
export const entLink = 'font-medium break-words text-ring underline-offset-2 hover:underline'

// Column header rule inside the surface (mirrors attribution-columns' ColHeader).
export const ColHeader = ({
  label,
  action,
  topBorder,
}: {
  label: string
  action?: ReactNode
  topBorder?: boolean
}) => (
  <div
    className={cn(
      'flex items-baseline justify-between gap-2 border-b border-border px-4 py-3 md:px-[18px]',
      topBorder && 'border-t',
    )}
  >
    <span className="font-sans text-[9.5px] font-semibold tracking-[0.13em] uppercase text-muted-foreground">
      {label}
    </span>
    {action}
  </div>
)

// ── Footline ────────────────────────────────────────────────────────────────

export const FootLine = ({ children }: { children: ReactNode }) => (
  <div className="flex flex-wrap gap-x-6 gap-y-1 px-4 py-2.5 text-[11px] text-muted-foreground md:px-6">
    {children}
  </div>
)
