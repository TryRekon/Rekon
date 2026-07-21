import type { CacheEvent, CacheInsights } from '../lib/insights'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Badge } from './ui/badge'
import { formatCompact, formatDuration, formatPercent, formatUsd } from '../lib/format'

const EVENT_STYLE: Record<CacheEvent['kind'], { label: string; color: string }> = {
  expired: { label: 'cache expired', color: 'var(--status-serious)' },
  cold: { label: 'cache miss', color: 'var(--status-critical)' },
  compaction: { label: 'compaction', color: 'var(--chart-input)' },
}

const MAX_EVENTS = 8

const eventDescription = (event: CacheEvent): string => {
  switch (event.kind) {
    case 'expired':
      return `idle ${event.gapMs !== null ? formatDuration(event.gapMs) : '?'} — re-wrote ${formatCompact(event.tokens)} tokens`
    case 'cold':
      return `prompt sent cold (history fork or rewrite) — ${formatCompact(event.tokens)} tokens paid uncached`
    case 'compaction':
      return `history rewritten — context shrank by ${formatCompact(event.tokens)} tokens`
  }
}

const scrollToTurn = (id: number) => {
  document.getElementById(`turn-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

const Stat = ({ label, value }: { label: string; value: string }) => (
  <div>
    <div className="text-xs text-muted-foreground">{label}</div>
    <div className="mt-0.5 text-lg font-semibold tracking-tight tabular-nums">{value}</div>
  </div>
)

export const CacheInsightsCard = ({ insights }: { insights: CacheInsights }) => {
  const shown = insights.events.slice(0, MAX_EVENTS)
  const hidden = insights.events.length - shown.length

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cache efficiency</CardTitle>
        <CardDescription>
          Derived from per-turn usage, assuming the 5-minute cache TTL (reads 0.1×, writes 1.25×
          input rate)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Stat
            label="Cache hit rate"
            value={insights.hitRate !== null ? formatPercent(insights.hitRate) : '—'}
          />
          <Stat label="Saved by caching" value={formatUsd(insights.savings)} />
          <Stat
            label="Avoidable rewrite cost"
            value={insights.avoidableCost !== null ? formatUsd(insights.avoidableCost) : '—'}
          />
          <Stat
            label="Re-written after idle"
            value={
              insights.expiredRewriteTokens > 0
                ? `${formatCompact(insights.expiredRewriteTokens)} tok`
                : '—'
            }
          />
        </div>

        {shown.length > 0 ? (
          <ul className="space-y-1.5">
            {shown.map((event) => {
              const style = EVENT_STYLE[event.kind]
              return (
                <li key={`${event.kind}-${event.turnId}`}>
                  <button
                    type="button"
                    onClick={() => scrollToTurn(event.turnId)}
                    className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-muted/60"
                  >
                    <Badge variant="outline">
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ backgroundColor: style.color }}
                        aria-hidden="true"
                      />
                      {style.label}
                    </Badge>
                    <span className="text-xs whitespace-nowrap text-muted-foreground">
                      Turn {event.turnIndex}
                    </span>
                    <span className="truncate text-xs">{eventDescription(event)}</span>
                    {event.avoidableCost !== null && (
                      <span className="ml-auto text-xs font-medium tabular-nums">
                        ~{formatUsd(event.avoidableCost)}
                      </span>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">
            No cache issues detected — every turn reused the cached prefix within its TTL.
          </p>
        )}

        {hidden > 0 && (
          <p className="text-xs text-muted-foreground">+{hidden} more events in the timeline below.</p>
        )}
        {insights.largeUncachedTurns > 0 && (
          <p className="text-xs text-muted-foreground">
            {insights.largeUncachedTurns} turn{insights.largeUncachedTurns === 1 ? '' : 's'} carried
            &gt;8k uncached input tokens (content past the last cache breakpoint) — a later
            breakpoint could move these to cache reads.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
