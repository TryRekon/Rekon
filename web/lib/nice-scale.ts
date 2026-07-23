// Smallest "nice" ceiling (1 / 2 / 2.5 / 5 / 10 × 10ⁿ) at or above v, for round
// axis ticks. Shared axis helper; charts that need a stepped interval instead of
// a ceiling can derive it as niceCeil(range / tickCount).
export const niceCeil = (v: number): number => {
  if (v <= 0) return 1
  const mag = 10 ** Math.floor(Math.log10(v))
  const n = v / mag
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10
  return step * mag
}
