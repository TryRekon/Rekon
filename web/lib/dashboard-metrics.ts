/**
 * Pure, strongly-typed helpers that derive the backed hero metrics from
 * DashboardData.  No React, no side effects, no DOM — safe to call from
 * server-side or test contexts.
 */
import type { DashboardTotals, DayBucket, RangeKey } from '../../shared/api-types'

// Token series in the fixed display order used by the burn-meter.
// Labels and var() color references mirror the SERIES constant in
// web/components/tokens-chart.tsx so the two are kept in sync.
type TokenKey = 'inputTokens' | 'outputTokens' | 'cacheCreationTokens' | 'cacheReadTokens'

const TOKEN_SERIES: ReadonlyArray<{ key: TokenKey; label: string; color: string }> = [
  { key: 'inputTokens', label: 'Input', color: 'var(--chart-input)' },
  { key: 'outputTokens', label: 'Output', color: 'var(--chart-output)' },
  { key: 'cacheCreationTokens', label: 'Cache write', color: 'var(--chart-cache-write)' },
  { key: 'cacheReadTokens', label: 'Cache read', color: 'var(--chart-cache-read)' },
]

// ─── Pace projection ──────────────────────────────────────────────────────────

/**
 * Projects the total spend for the current period from the partial elapsed
 * data in byDay.
 *
 * For '30d' the period is the full calendar month containing generatedAt —
 * daysElapsed is the UTC day-of-month and the rate is projected out to
 * daysInMonth, giving a meaningful forward estimate while the month is still
 * in progress.
 *
 * For all other ranges (7d, 90d, all) the historical window has already fully
 * elapsed so no extrapolation is meaningful; projected equals the elapsed sum
 * and periodLabel names the range.
 *
 * Never divides by zero; safe on an empty byDay array.
 */
export function paceProjection(
  byDay: DayBucket[],
  range: RangeKey,
  generatedAt: number,
): { projected: number; periodLabel: string } {
  // Sum costs; null means unrecognized model → treat as $0.
  const elapsedSum = byDay.reduce((acc, d) => acc + (d.cost ?? 0), 0)

  if (range === '30d') {
    const genDate = new Date(generatedAt)
    const year = genDate.getUTCFullYear()
    const month = genDate.getUTCMonth() // 0-based
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
    // getUTCDate() is 1-based: on the 1st, daysElapsed = 1 (never 0).
    const daysElapsed = Math.max(1, genDate.getUTCDate())
    return {
      projected: (elapsedSum / daysElapsed) * daysInMonth,
      periodLabel: genDate.toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      }),
    }
  }

  if (range === 'all') {
    // Unbounded range — no forward-projection is defined; return the
    // running total as-is with a plain label.
    return { projected: elapsedSum, periodLabel: 'all time' }
  }

  // '7d' | '90d': fixed historical lookback; the whole window has elapsed
  // so projected == sum (rate × rangeDays / rangeDays cancels out).
  const periodLabel = range === '7d' ? 'the past 7 days' : 'the past 90 days'
  return { projected: elapsedSum, periodLabel }
}

// ─── Spend anomaly ────────────────────────────────────────────────────────────

/**
 * Identifies the single highest-spend day if it is at least 2× the median
 * cost of non-zero days.
 *
 * Returns null when byDay is empty, every day has zero/null cost, or no day
 * clears the 2× threshold.  timesMedian is rounded to one decimal place.
 */
export function spendAnomaly(
  byDay: DayBucket[],
): { day: string; cost: number; timesMedian: number } | null {
  // Collect days that have a positive reported cost.
  const active = byDay
    .filter((d): d is DayBucket & { cost: number } => d.cost !== null && d.cost > 0)
    .map((d) => ({ day: d.day, cost: d.cost }))

  if (active.length === 0) return null

  // Median of non-zero day costs.
  const sorted = [...active].sort((a, b) => a.cost - b.cost)
  const mid = Math.floor(sorted.length / 2)
  const midCost = sorted[mid]?.cost ?? 0
  const prevCost = sorted[mid - 1]?.cost ?? 0
  const median =
    sorted.length % 2 === 1
      ? midCost
      : (prevCost + midCost) / 2

  // Guard: if the median is somehow zero we cannot form a meaningful ratio.
  if (median <= 0) return null

  // Find the maximum-cost day.
  const maxEntry = active.reduce((best, d) => (d.cost > best.cost ? d : best))
  const ratio = maxEntry.cost / median

  if (ratio < 2) return null

  return {
    day: maxEntry.day,
    cost: maxEntry.cost,
    timesMedian: Math.round(ratio * 10) / 10,
  }
}

// ─── Cache-hit ratio ──────────────────────────────────────────────────────────

/**
 * Fraction of input + cache-read tokens that were served from cache.
 * Defined proxy: cacheReadTokens / (cacheReadTokens + inputTokens).
 * Returns 0 (not NaN) when the denominator is zero.
 */
export function cacheHitRatio(totals: DashboardTotals): number {
  const denom = totals.cacheReadTokens + totals.inputTokens
  return denom === 0 ? 0 : totals.cacheReadTokens / denom
}

// ─── Token mix by count ───────────────────────────────────────────────────────

/**
 * Fractional share of each token type as a proportion of the total token count,
 * returned in the fixed display order defined by TOKEN_SERIES above.
 *
 * Shares sum to 1 when total > 0.  All-zero totals yield share: 0 for every
 * series (no NaN).
 */
export function tokenMixByCount(
  totals: DashboardTotals,
): { key: string; label: string; color: string; share: number }[] {
  const total =
    totals.inputTokens +
    totals.outputTokens +
    totals.cacheCreationTokens +
    totals.cacheReadTokens

  return TOKEN_SERIES.map(({ key, label, color }) => ({
    key,
    label,
    color,
    share: total === 0 ? 0 : totals[key] / total,
  }))
}
