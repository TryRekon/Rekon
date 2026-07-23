import { describe, it, expect } from 'vitest'
import { estimateTokens, serializeContent, truncateForStorage } from '../../src/db/tool-calls'

// Anthropic-style image discriminant, mirroring anthropic/session.ts.
const imagePlaceholder = (block: { type?: string; source?: { media_type?: string } }) =>
  block?.type === 'image' ? `[image ${block.source?.media_type ?? 'unknown'}]` : null

describe('estimateTokens', () => {
  it('is ceil(chars / 4)', () => {
    expect(estimateTokens(0)).toBe(0)
    expect(estimateTokens(1)).toBe(1)
    expect(estimateTokens(4)).toBe(1)
    expect(estimateTokens(5)).toBe(2)
    expect(estimateTokens(4000)).toBe(1000)
  })
})

describe('serializeContent', () => {
  it('keeps a string verbatim and char-estimates it', () => {
    expect(serializeContent('hello world', imagePlaceholder)).toEqual({
      text: 'hello world',
      tokens: estimateTokens('hello world'.length),
    })
  })

  it('joins text blocks and swaps images for a flat-rate placeholder', () => {
    const { text, tokens } = serializeContent(
      [
        { type: 'text', text: 'before' },
        { type: 'image', source: { media_type: 'image/png' } },
        { type: 'text', text: 'after' },
      ],
      imagePlaceholder,
    )
    expect(text).toBe('before\n[image image/png]\nafter')
    // 'before'(2) + '[image ...]' flat 1500 + 'after'(2)
    expect(tokens).toBe(estimateTokens(6) + 1500 + estimateTokens(5))
  })

  it('returns empty for a non-string, non-array content', () => {
    expect(serializeContent(null, imagePlaceholder)).toEqual({ text: '', tokens: 0 })
  })
})

describe('truncateForStorage', () => {
  it('leaves short values untouched', () => {
    expect(truncateForStorage('short')).toBe('short')
  })

  it('truncates values over the 8000-char cap with a marker', () => {
    const long = 'x'.repeat(8001)
    const out = truncateForStorage(long)
    expect(out.endsWith('…[truncated]')).toBe(true)
    expect(out.length).toBe(8000 + '…[truncated]'.length)
  })
})
