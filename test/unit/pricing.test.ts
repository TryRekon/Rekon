import { describe, it, expect } from 'vitest'
import {
  resolvePricing,
  cacheReadPrice,
  estimateCostUsd,
  CACHE_READ_MULTIPLIER,
  CACHE_WRITE_MULTIPLIER,
  PER_TOKENS,
} from '../../shared/pricing'

describe('resolvePricing', () => {
  it('matches an exact model id', () => {
    expect(resolvePricing('claude-opus-4-8')).toEqual({ input: 5, output: 25 })
  })

  it('longest-prefix wins over a shorter overlapping id', () => {
    // 'gpt-5' and 'gpt-5-mini' both prefix 'gpt-5-mini-2026'; the longer must win.
    expect(resolvePricing('gpt-5-mini-2026-01-01')).toEqual(
      resolvePricing('gpt-5-mini'),
    )
    expect(resolvePricing('gpt-5-mini-2026-01-01')?.input).toBe(0.25)
    // A dated gpt-5 (no -mini) still resolves to the base gpt-5 row.
    expect(resolvePricing('gpt-5-2026-01-01')?.input).toBe(1.25)
  })

  it('matches provider-dated suffixes (real wire model ids)', () => {
    expect(resolvePricing('claude-haiku-4-5-20251001')).toEqual(resolvePricing('claude-haiku-4-5'))
  })

  it('returns null for an unknown model and for null', () => {
    expect(resolvePricing('gemini-3-pro')).toBeNull()
    expect(resolvePricing(null)).toBeNull()
  })
})

describe('cacheReadPrice', () => {
  it('uses the published cachedInput list price when present (OpenAI)', () => {
    const p = resolvePricing('gpt-5.6')!
    expect(p.cachedInput).toBe(0.5)
    expect(cacheReadPrice(p)).toBe(0.5)
  })

  it('falls back to input × CACHE_READ_MULTIPLIER when no cachedInput (Anthropic)', () => {
    const p = resolvePricing('claude-opus-4-8')!
    expect(p.cachedInput).toBeUndefined()
    expect(cacheReadPrice(p)).toBeCloseTo(5 * CACHE_READ_MULTIPLIER, 10)
  })
})

describe('estimateCostUsd', () => {
  it('sums input/output/cache-read/cache-write over PER_TOKENS', () => {
    const cost = estimateCostUsd('claude-opus-4-8', {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      cacheReadTokens: 1_000_000,
      cacheCreationTokens: 1_000_000,
    })
    const expected =
      (1_000_000 * 5 +
        1_000_000 * 25 +
        1_000_000 * (5 * CACHE_READ_MULTIPLIER) +
        1_000_000 * 5 * CACHE_WRITE_MULTIPLIER) /
      PER_TOKENS
    expect(cost).toBeCloseTo(expected, 6)
  })

  it('treats null token buckets as zero', () => {
    expect(
      estimateCostUsd('claude-opus-4-8', {
        inputTokens: 1_000_000,
        outputTokens: null,
        cacheReadTokens: null,
        cacheCreationTokens: null,
      }),
    ).toBeCloseTo(5, 10)
  })

  it('returns null when the model is unknown (never a bogus 0)', () => {
    expect(
      estimateCostUsd('mystery-model', {
        inputTokens: 100,
        outputTokens: 100,
        cacheReadTokens: null,
        cacheCreationTokens: null,
      }),
    ).toBeNull()
  })
})
