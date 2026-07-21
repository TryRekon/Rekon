// USD per million tokens, from platform.claude.com/docs/en/pricing and
// platform.openai.com/pricing (July 2026). Cache read cost: models publishing
// a cached-input list price (OpenAI) carry it in `cachedInput`; the rest fall
// back to input × CACHE_READ_MULTIPLIER (~0.1x, Anthropic's rate). Cache
// writes bill at input × CACHE_WRITE_MULTIPLIER (~1.25x) for both providers:
// Anthropic's 5-minute TTL rate (the proxy doesn't record the TTL split, so 1h
// writes are underestimated) and OpenAI's GPT-5.6+ cache_write rate.
export interface ModelPricing {
  input: number
  output: number
  cachedInput?: number
}

const PRICING: Record<string, ModelPricing> = {
  'claude-fable-5': { input: 10, output: 50 },
  'claude-mythos-5': { input: 10, output: 50 },
  'claude-opus-4-8': { input: 5, output: 25 },
  'claude-opus-4-7': { input: 5, output: 25 },
  'claude-opus-4-6': { input: 5, output: 25 },
  'claude-opus-4-5': { input: 5, output: 25 },
  'claude-sonnet-5': { input: 3, output: 15 },
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-sonnet-4-5': { input: 3, output: 15 },
  'claude-haiku-4-5': { input: 1, output: 5 },
  'gpt-5.6': { input: 5, output: 30, cachedInput: 0.5 },
  'gpt-5.6-sol': { input: 5, output: 30, cachedInput: 0.5 },
  'gpt-5.6-terra': { input: 2.5, output: 15, cachedInput: 0.25 },
  'gpt-5.6-luna': { input: 1, output: 6, cachedInput: 0.1 },
  'gpt-5.1': { input: 1.25, output: 10, cachedInput: 0.125 },
  'gpt-5': { input: 1.25, output: 10, cachedInput: 0.125 },
  'gpt-5-mini': { input: 0.25, output: 2, cachedInput: 0.025 },
  'gpt-5-nano': { input: 0.05, output: 0.4, cachedInput: 0.005 },
  'gpt-5-pro': { input: 15, output: 120 },
  'gpt-4.1': { input: 2, output: 8, cachedInput: 0.5 },
  'gpt-4.1-mini': { input: 0.4, output: 1.6, cachedInput: 0.1 },
  'gpt-4.1-nano': { input: 0.1, output: 0.4, cachedInput: 0.025 },
  'gpt-4o': { input: 2.5, output: 10, cachedInput: 1.25 },
  'gpt-4o-mini': { input: 0.15, output: 0.6, cachedInput: 0.075 },
  o3: { input: 2, output: 8, cachedInput: 0.5 },
  'o3-pro': { input: 20, output: 80 },
  'o3-mini': { input: 1.1, output: 4.4, cachedInput: 0.55 },
  'o4-mini': { input: 1.1, output: 4.4, cachedInput: 0.275 },
}

export const CACHE_READ_MULTIPLIER = 0.1
export const CACHE_WRITE_MULTIPLIER = 1.25
export const PER_TOKENS = 1_000_000

export interface CostTokens {
  inputTokens: number | null
  outputTokens: number | null
  cacheReadTokens: number | null
  cacheCreationTokens: number | null
}

export const resolvePricing = (model: string | null): ModelPricing | null => {
  if (!model) return null
  const match = Object.keys(PRICING)
    .filter((id) => model.startsWith(id))
    .sort((a, b) => b.length - a.length)[0]
  return match ? (PRICING[match] ?? null) : null
}

export const cacheReadPrice = (pricing: ModelPricing): number =>
  pricing.cachedInput ?? pricing.input * CACHE_READ_MULTIPLIER

export const estimateCostUsd = (model: string | null, tokens: CostTokens): number | null => {
  const pricing = resolvePricing(model)
  if (!pricing) return null
  return (
    ((tokens.inputTokens ?? 0) * pricing.input +
      (tokens.outputTokens ?? 0) * pricing.output +
      (tokens.cacheReadTokens ?? 0) * cacheReadPrice(pricing) +
      (tokens.cacheCreationTokens ?? 0) * pricing.input * CACHE_WRITE_MULTIPLIER) /
    PER_TOKENS
  )
}
