export interface BackoffInputState {
  consecutiveEmptyPulls: number
  currentIntervalHours: number
  consecutiveErrors: number
  lastPulledAt: Date | null
  lastHadDataAt: Date | null
  lastError: string | null
  lastErrorAt: Date | null
}

export type SyncOutcome =
  | { kind: 'empty' }
  | { kind: 'non-empty' }
  | { kind: 'error'; message: string }

const INTERVAL_BY_EMPTY_COUNT: Record<number, number> = { 0: 3, 1: 6 }

function intervalForEmptyCount(n: number): number {
  return INTERVAL_BY_EMPTY_COUNT[n] ?? 12
}

export function advanceBackoff(
  prev: BackoffInputState,
  outcome: SyncOutcome | 'empty' | 'non-empty' | 'error',
  now: Date,
): BackoffInputState {
  const kind = typeof outcome === 'string' ? outcome : outcome.kind
  if (kind === 'error') {
    const message =
      typeof outcome === 'string' ? 'error' : outcome.kind === 'error' ? outcome.message : 'error'
    return {
      ...prev,
      consecutiveErrors: prev.consecutiveErrors + 1,
      lastError: message,
      lastErrorAt: now,
    }
  }
  if (kind === 'empty') {
    const next = prev.consecutiveEmptyPulls + 1
    return {
      ...prev,
      lastPulledAt: now,
      lastError: null,
      consecutiveErrors: 0,
      consecutiveEmptyPulls: next,
      currentIntervalHours: intervalForEmptyCount(next),
    }
  }
  // non-empty
  return {
    ...prev,
    lastPulledAt: now,
    lastHadDataAt: now,
    lastError: null,
    consecutiveErrors: 0,
    consecutiveEmptyPulls: 0,
    currentIntervalHours: 3,
  }
}

export function isDue(prev: BackoffInputState, now: Date): boolean {
  if (prev.lastPulledAt === null) return true
  const dueAtMs = prev.lastPulledAt.getTime() + prev.currentIntervalHours * 3_600_000
  return dueAtMs <= now.getTime()
}
