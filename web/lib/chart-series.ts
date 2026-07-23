// Canonical token-series order, display labels, and chart color tokens — the
// single source of truth shared by the tokens-per-day chart
// (web/components/tokens-chart.tsx) and the dashboard token-mix strip
// (web/components/token-mix-strip.tsx) so the two never drift out of order.
// Order matches the dashboard StatStrip: input, output, cache read, cache write.
export const TOKEN_SERIES = [
  { key: 'inputTokens', label: 'Input', color: 'var(--chart-input)' },
  { key: 'outputTokens', label: 'Output', color: 'var(--chart-output)' },
  { key: 'cacheReadTokens', label: 'Cache read', color: 'var(--chart-cache-read)' },
  { key: 'cacheCreationTokens', label: 'Cache write', color: 'var(--chart-cache-write)' },
] as const

export type TokenSeriesKey = (typeof TOKEN_SERIES)[number]['key']
