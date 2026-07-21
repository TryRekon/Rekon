import type { SessionTurn } from '../../shared/api-types'
import {
  cacheReadPrice,
  CACHE_READ_MULTIPLIER,
  CACHE_WRITE_MULTIPLIER,
  PER_TOKENS,
  resolvePricing,
} from '../../shared/pricing'

// Cache-policy analysis derived purely from recorded per-turn usage. Gaps are
// measured against the PARENT turn (requests form a tree — Claude Code fires
// parallel side-requests like title generation into the same session, so
// wall-clock order would produce bogus gaps).

export const CACHE_TTL_MS = 5 * 60_000
const REWRITE_MIN_TOKENS = 1024
const COLD_PROMPT_MIN_TOKENS = 4096
const COLD_READ_MAX_TOKENS = 256
const LARGE_UNCACHED_INPUT_TOKENS = 8192

export interface TurnMetrics {
  turnId: number
  index: number
  promptTokens: number
  gapMs: number | null
  expiredRewrite: boolean
  coldStart: boolean
  compaction: boolean
}

export interface CacheEvent {
  kind: 'expired' | 'cold' | 'compaction'
  turnId: number
  turnIndex: number
  gapMs: number | null
  tokens: number
  avoidableCost: number | null
}

export interface CacheInsights {
  hitRate: number | null
  savings: number | null
  avoidableCost: number | null
  expiredRewriteTokens: number
  uncachedInputTokens: number
  largeUncachedTurns: number
  maxPromptTokens: number
  events: CacheEvent[]
  metricsByTurn: Map<number, TurnMetrics>
}

const promptTokensOf = (t: SessionTurn): number =>
  (t.inputTokens ?? 0) + (t.cacheReadTokens ?? 0) + (t.cacheCreationTokens ?? 0)

export const computeCacheInsights = (turns: SessionTurn[]): CacheInsights => {
  const byId = new Map(turns.map((t) => [t.id, t]))
  const metricsByTurn = new Map<number, TurnMetrics>()
  const events: CacheEvent[] = []

  let promptTotal = 0
  let readTotal = 0
  let actualInputCost = 0
  let noCacheCost = 0
  let pricedAny = false
  let avoidableCost: number | null = null
  let expiredRewriteTokens = 0
  let uncachedInputTokens = 0
  let largeUncachedTurns = 0
  let maxPromptTokens = 0

  turns.forEach((turn, i) => {
    const index = i + 1
    const prompt = promptTokensOf(turn)
    const input = turn.inputTokens ?? 0
    const read = turn.cacheReadTokens ?? 0
    const write = turn.cacheCreationTokens ?? 0

    promptTotal += prompt
    readTotal += read
    uncachedInputTokens += input
    if (input >= LARGE_UNCACHED_INPUT_TOKENS) largeUncachedTurns += 1
    if (prompt > maxPromptTokens) maxPromptTokens = prompt

    const pricing = resolvePricing(turn.model)
    if (pricing) {
      pricedAny = true
      actualInputCost +=
        ((input + write * CACHE_WRITE_MULTIPLIER) * pricing.input + read * cacheReadPrice(pricing)) /
        PER_TOKENS
      noCacheCost += (prompt * pricing.input) / PER_TOKENS
    }

    const parent = turn.parentRequestId === null ? undefined : byId.get(turn.parentRequestId)
    const gapMs = parent ? Math.max(0, turn.createdAt - parent.createdAt) : null

    // A real TTL expiry leaves nothing to read — the whole prefix comes back
    // as cache_creation. A long gap with a healthy read means the cache
    // survived (something else refreshed it) and is not an event.
    const wentCold =
      gapMs !== null && read <= COLD_READ_MAX_TOKENS && prompt >= COLD_PROMPT_MIN_TOKENS
    const expiredRewrite = wentCold && gapMs >= CACHE_TTL_MS && write >= REWRITE_MIN_TOKENS
    const coldStart = wentCold && gapMs < CACHE_TTL_MS
    const compaction = turn.newInputTokens !== null && turn.newInputTokens < 0

    if (expiredRewrite) {
      expiredRewriteTokens += write
      const cost = pricing
        ? (write * (CACHE_WRITE_MULTIPLIER - CACHE_READ_MULTIPLIER) * pricing.input) / PER_TOKENS
        : null
      if (cost !== null) avoidableCost = (avoidableCost ?? 0) + cost
      events.push({ kind: 'expired', turnId: turn.id, turnIndex: index, gapMs, tokens: write, avoidableCost: cost })
    } else if (coldStart) {
      events.push({
        kind: 'cold',
        turnId: turn.id,
        turnIndex: index,
        gapMs,
        tokens: input + write,
        avoidableCost: null,
      })
    }
    if (compaction) {
      events.push({
        kind: 'compaction',
        turnId: turn.id,
        turnIndex: index,
        gapMs,
        tokens: Math.abs(turn.newInputTokens ?? 0),
        avoidableCost: null,
      })
    }

    metricsByTurn.set(turn.id, {
      turnId: turn.id,
      index,
      promptTokens: prompt,
      gapMs,
      expiredRewrite,
      coldStart,
      compaction,
    })
  })

  return {
    hitRate: promptTotal > 0 ? readTotal / promptTotal : null,
    savings: pricedAny ? noCacheCost - actualInputCost : null,
    avoidableCost,
    expiredRewriteTokens,
    uncachedInputTokens,
    largeUncachedTurns,
    maxPromptTokens,
    events,
    metricsByTurn,
  }
}
