/**
 * Pure, strongly-typed helpers that derive the backed hero metrics from
 * DashboardData.  No React, no side effects, no DOM — safe to call from
 * server-side or test contexts.
 */
import type { DashboardTotals, DayBucket, RangeKey } from '../../shared/api-types'
import { TOKEN_SERIES } from './chart-series'

// ─── Pace projection ──────────────────────────────────────────────────────────

/**
 * Projects the total spend for the current period from the partial elapsed
 * data in byDay.
 *
 * For '30d' (the default range) the period is the calendar month containing
 * generatedAt. The server feeds a ROLLING 30-day window, not month-to-date, so
 * we first restrict byDay to the days that fall inside the current UTC month,
 * then project that month-to-date sum out to daysInMonth by the UTC
 * day-of-month. Mixing the rolling-window sum with the day-of-month divisor
 * (the previous bug) over-projected by up to ~monthLength/dayOfMonth ×.
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
    // Restrict to days inside the current UTC month so the month-to-date sum
    // matches the day-of-month divisor. byDay days are 'YYYY-MM-DD' strings.
    const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}`
    const monthToDate = byDay.reduce(
      (acc, d) => (d.day.startsWith(monthPrefix) ? acc + (d.cost ?? 0) : acc),
      0,
    )
    return {
      projected: (monthToDate / daysElapsed) * daysInMonth,
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
 * cost of the OTHER non-zero days.
 *
 * The median is taken over the active days EXCLUDING the candidate (the max).
 * Including the candidate makes an anomaly impossible to detect for small n —
 * with exactly two active days the median sits at their midpoint, so the ratio
 * `2·max/(min+max)` can never reach 2 for positive costs (the previous bug).
 * Excluding the candidate compares "the spike day vs a typical other day",
 * which is what the callout claims.
 *
 * Returns null when there are fewer than two active days, the median of the
 * rest is zero, or the candidate is under the 2× threshold. `timesMedian` is
 * rounded to one decimal place for display; `median` is the exact value the
 * ratio was computed against (so callers can draw the reference line without
 * re-deriving it from the rounded ratio).
 */
export function spendAnomaly(
  byDay: DayBucket[],
): { day: string; cost: number; timesMedian: number; median: number } | null {
  // Collect days that have a positive reported cost.
  const active = byDay
    .filter((d): d is DayBucket & { cost: number } => d.cost !== null && d.cost > 0)
    .map((d) => ({ day: d.day, cost: d.cost }))

  // Need the candidate plus at least one other day to form a median-of-rest.
  if (active.length < 2) return null

  // Candidate = the single highest-cost day.
  const maxEntry = active.reduce((best, d) => (d.cost > best.cost ? d : best))

  // Median of the remaining days (candidate excluded, one instance removed).
  const rest = [...active]
  rest.splice(rest.indexOf(maxEntry), 1)
  const sorted = rest.map((d) => d.cost).sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  const median =
    sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2

  // Guard: a zero median cannot form a meaningful ratio.
  if (median <= 0) return null

  const ratio = maxEntry.cost / median
  if (ratio < 2) return null

  return {
    day: maxEntry.day,
    cost: maxEntry.cost,
    timesMedian: Math.round(ratio * 10) / 10,
    median,
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
