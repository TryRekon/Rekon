import type { DashboardTotals } from '../../shared/api-types'
import { Card, CardContent } from './ui/card'
import { tokenMixByCount } from '../lib/dashboard-metrics'
import { formatPercent } from '../lib/format'

// Glance-layer token-mix strip: a single stacked bar of each token type's share
// of the total token COUNT (the API returns counts, not per-type cost — the
// cost-weighted variant is deferred, see the dashboard Backing Ledger). Identity
// is never color-alone: every segment is also named in the legend below.
export const TokenMixStrip = ({ totals }: { totals: DashboardTotals }) => {
  const mix = tokenMixByCount(totals)
  const hasTokens = mix.some((m) => m.share > 0)
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4">
        <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
          Token mix · by count
        </span>
        {hasTokens ? (
          <>
            <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
              {mix.map((m) =>
                m.share > 0 ? (
                  <div
                    key={m.key}
                    style={{ width: `${m.share * 100}%`, backgroundColor: m.color }}
                    title={`${m.label} ${formatPercent(m.share)}`}
                  />
                ) : null,
              )}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
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
      </CardContent>
    </Card>
  )
}
