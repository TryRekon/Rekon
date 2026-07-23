import type { DashboardTotals } from '../../shared/api-types'
import { tokenMixByCount } from '../lib/dashboard-metrics'
import { formatPercent } from '../lib/format'

// Glance-layer token-mix strip: a single stacked bar of each token type's share
// of the total token COUNT (the API returns counts, not per-type cost — the
// cost-weighted "share of cost" variant the mock shows is deferred, see the
// dashboard Backing Ledger). So the title is the honest "by count".
//
// Bare region (no Card): the dashboard composes it into its single hairline
// surface, providing the border-b itself. Identity is never color-alone —
// every segment carries an inline label on the bar (when wide enough) AND a
// named legend entry below.
export const TokenMixStrip = ({ totals }: { totals: DashboardTotals }) => {
  const mix = tokenMixByCount(totals)
  const hasTokens = mix.some((m) => m.share > 0)
  return (
    <div className="flex flex-col gap-2 px-4 py-3.5 md:px-6">
      <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
        Token mix · by count
      </span>
      {hasTokens ? (
        <>
          <div className="mt-0.5 flex h-[22px] gap-0.5 overflow-hidden rounded-[4px]">
            {mix.map((m) =>
              m.share > 0 ? (
                <div
                  key={m.key}
                  className="flex items-center overflow-hidden pl-2 font-mono text-[10px] font-semibold whitespace-nowrap text-chart-label"
                  style={{ width: `${m.share * 100}%`, backgroundColor: m.color }}
                  title={`${m.label} ${formatPercent(m.share)}`}
                >
                  {m.share >= 0.15 ? `${m.label.toUpperCase()} ${formatPercent(m.share)}` : ''}
                </div>
              ) : null,
            )}
          </div>
          <div className="mt-0.5 flex flex-wrap gap-x-4 gap-y-1">
            {mix.map((m) => (
              <span
                key={m.key}
                className="inline-flex items-center gap-1.5 text-xs text-secondary-ink"
              >
                <span
                  className="h-2 w-2 rounded-[2px]"
                  style={{ backgroundColor: m.color }}
                  aria-hidden="true"
                />
                {m.label}
                <span className="font-mono tabular-nums text-muted-foreground">
                  {formatPercent(m.share)}
                </span>
              </span>
            ))}
          </div>
        </>
      ) : (
        <p className="text-xs text-muted-foreground">No token usage recorded in this range.</p>
      )}
    </div>
  )
}
