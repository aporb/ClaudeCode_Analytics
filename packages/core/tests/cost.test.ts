import { describe, expect, it } from 'vitest'
import { type ModelPricing, type TokenUsage, calculateCost } from '../src/cost.js'

const sonnetPricing: ModelPricing = {
  inputPerMtok: 3,
  outputPerMtok: 15,
  cacheWrite5mPerMtok: 3.75,
  cacheWrite1hPerMtok: 6,
  cacheReadPerMtok: 0.3,
}

describe('cost', () => {
  it('computes cost for plain input+output', () => {
    const usage: TokenUsage = {
      inputTokens: 1_000_000,
      outputTokens: 500_000,
      cacheCreation5mTokens: 0,
      cacheCreation1hTokens: 0,
      cacheReadTokens: 0,
    }
    // 1M input * $3 + 0.5M output * $15 = 3 + 7.5 = 10.5
    expect(calculateCost(usage, sonnetPricing)).toBeCloseTo(10.5, 4)
  })

  it('includes cache writes and reads', () => {
    const usage: TokenUsage = {
      inputTokens: 0,
      outputTokens: 0,
      cacheCreation5mTokens: 1_000_000,
      cacheCreation1hTokens: 500_000,
      cacheReadTokens: 2_000_000,
    }
    // 1M * 3.75 + 0.5M * 6 + 2M * 0.3 = 3.75 + 3 + 0.6 = 7.35
    expect(calculateCost(usage, sonnetPricing)).toBeCloseTo(7.35, 4)
  })

  it('returns 0 for zero tokens', () => {
    expect(
      calculateCost(
        {
          inputTokens: 0,
          outputTokens: 0,
          cacheCreation5mTokens: 0,
          cacheCreation1hTokens: 0,
          cacheReadTokens: 0,
        },
        sonnetPricing,
      ),
    ).toBe(0)
  })
})
