import { createContext, useContext, type CSSProperties, type HTMLAttributes, type ReactNode } from 'react'
import { cn } from '../../lib/utils'

/**
 * Unbacked — the gap-flag primitive (see .claude/design-system.md
 * "Gap-flag convention", KTD3/KTD4). Marks a designed element that has no real
 * backing data yet: the slot still renders at its NATURAL size, dimmed, with an
 * on-theme under-construction treatment painted on top via a layout-neutral
 * overlay — warm `hold` hazard stripes, a dashed frame (a negative-offset
 * outline, which never affects layout), and a floating badge — so nobody
 * mistakes it for live data AND the flag never shifts the surrounding layout.
 *
 * Switchable at runtime via ShowScaffoldingContext: when false the children
 * render plain ("preview as if live"). Default is ON so gaps are obvious.
 *
 * Honesty policy: every call site MUST also carry an adjacent
 * `// TODO(stitch-gap): <what's missing>` comment so unbacked visuals stay
 * greppable until real data lands (enforced by scripts/check-gap-flags.mjs).
 */

/** True = show the under-construction treatment; false = render children plain. */
export const ShowScaffoldingContext = createContext(true)

// A dashed frame that adds NO box size: an outline drawn inside the element
// bounds (negative offset), so it never grows the element or shifts neighbors.
// `var(--hold)` is the sanctioned JS-literal token form (design-system.md §6).
const FRAME: CSSProperties = {
  outline: '1px dashed var(--hold)',
  outlineOffset: '-1px',
}

function ConeGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <path d="M12 3 19 20H5L12 3Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M9 12h6M7.5 16h9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

interface UnbackedProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  /** What the element is — used for tooltip + a11y label. */
  label: string
  /** The designed element to render in its provisional state. */
  children?: ReactNode
  /** Short note on what's missing. Defaults to "Not wired". */
  note?: string
  /**
   * "block" (default) = overlay for panels/regions, with a floating "under
   * construction" badge. "inline" = overlay for icons / chips / inline cells
   * (frame + a small corner cone, no text badge). Both keep the child's size.
   */
  variant?: 'block' | 'inline'
}

export const Unbacked = ({
  label,
  children,
  note = 'Not wired',
  variant = 'block',
  className,
  ...props
}: UnbackedProps) => {
  const show = useContext(ShowScaffoldingContext)

  // Preview mode — render the designed element as if it were live.
  if (!show) return <>{children ?? null}</>

  const a11y = {
    title: `${label} — under construction (${note})`,
    'aria-label': `${label} — under construction, ${note}`,
  }

  // Childless — a self-sized placeholder box (no host element to overlay). This
  // IS the element's size, so there's nothing to preserve.
  if (!children) {
    return (
      <div
        {...props}
        {...a11y}
        style={FRAME}
        className={cn(
          'hazard relative flex min-h-16 items-center justify-center rounded-md px-3 py-6',
          className,
        )}
      >
        <span className="pointer-events-none absolute left-2 top-2 inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.14em] text-hold">
          <ConeGlyph className="h-3 w-3 shrink-0" />
          Under construction
        </span>
        <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
          {label}
        </span>
      </div>
    )
  }

  // Inline — overlay for icons / chips / inline cells. Wrapper is sized to the
  // child (no padding/border in flow); frame + cone are painted on top.
  if (variant === 'inline') {
    return (
      <span {...props} {...a11y} className={cn('relative inline-flex align-middle', className)}>
        <span className="inline-flex opacity-60 pointer-events-none">{children}</span>
        <span
          aria-hidden="true"
          style={FRAME}
          className="hazard pointer-events-none absolute inset-0 rounded-sm"
        />
        <ConeGlyph className="pointer-events-none absolute -right-1 -top-1 h-2.5 w-2.5 text-hold" />
      </span>
    )
  }

  // Block — overlay for panels/regions. Child keeps its natural box; the frame,
  // hazard stripes, and floating badge sit on top.
  return (
    <div {...props} {...a11y} className={cn('relative block', className)}>
      <div className="opacity-60 pointer-events-none">{children}</div>
      <div
        aria-hidden="true"
        style={FRAME}
        className="hazard pointer-events-none absolute inset-0 rounded-md"
      />
      <span className="pointer-events-none absolute left-0 top-0 inline-flex items-center gap-1 rounded-br-md bg-hold/15 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-hold">
        <ConeGlyph className="h-3 w-3 shrink-0" />
        Under construction
      </span>
    </div>
  )
}
