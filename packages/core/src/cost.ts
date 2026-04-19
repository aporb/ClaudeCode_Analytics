export interface TokenUsage {
  inputTokens: number
  outputTokens: number
  cacheCreation5mTokens: number
  cacheCreation1hTokens: number
  cacheReadTokens: number
}

export interface ModelPricing {
  inputPerMtok: number
  outputPerMtok: number
  cacheWrite5mPerMtok: number
  cacheWrite1hPerMtok: number
  cacheReadPerMtok: number
}

export function calculateCost(usage: TokenUsage, pricing: ModelPricing): number {
  const MTOK = 1_000_000
  return (
    (usage.inputTokens / MTOK) * pricing.inputPerMtok +
    (usage.outputTokens / MTOK) * pricing.outputPerMtok +
    (usage.cacheCreation5mTokens / MTOK) * pricing.cacheWrite5mPerMtok +
    (usage.cacheCreation1hTokens / MTOK) * pricing.cacheWrite1hPerMtok +
    (usage.cacheReadTokens / MTOK) * pricing.cacheReadPerMtok
  )
}
