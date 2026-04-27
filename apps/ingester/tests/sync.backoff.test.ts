import { describe, it, expect } from 'vitest'
import { advanceBackoff, type BackoffInputState } from '../src/sync/backoff.js'

interface State {
  consecutiveEmptyPulls: number
  currentIntervalHours: number
  consecutiveErrors: number
}

const NOW = new Date('2026-04-26T12:00:00Z')

function makePrev(state: State): BackoffInputState {
  return {
    consecutiveEmptyPulls: state.consecutiveEmptyPulls,
    currentIntervalHours: state.currentIntervalHours,
    consecutiveErrors: state.consecutiveErrors,
    lastPulledAt: null,
    lastHadDataAt: null,
    lastError: null,
    lastErrorAt: null,
  }
}

describe('advanceBackoff', () => {
  const cases: Array<{
    name: string
    prev: State
    outcome: 'empty' | 'non-empty' | 'error'
    expected: Partial<State>
  }> = [
    {
      name: '0 empty → 3h',
      prev: { consecutiveEmptyPulls: 0, currentIntervalHours: 3, consecutiveErrors: 0 },
      outcome: 'non-empty',
      expected: { consecutiveEmptyPulls: 0, currentIntervalHours: 3 },
    },
    {
      name: 'first empty: 0 → 1, 3h → 6h',
      prev: { consecutiveEmptyPulls: 0, currentIntervalHours: 3, consecutiveErrors: 0 },
      outcome: 'empty',
      expected: { consecutiveEmptyPulls: 1, currentIntervalHours: 6 },
    },
    {
      name: 'second empty: 1 → 2, 6h → 12h',
      prev: { consecutiveEmptyPulls: 1, currentIntervalHours: 6, consecutiveErrors: 0 },
      outcome: 'empty',
      expected: { consecutiveEmptyPulls: 2, currentIntervalHours: 12 },
    },
    {
      name: 'third empty: stays at 12h',
      prev: { consecutiveEmptyPulls: 2, currentIntervalHours: 12, consecutiveErrors: 0 },
      outcome: 'empty',
      expected: { consecutiveEmptyPulls: 3, currentIntervalHours: 12 },
    },
    {
      name: 'reset on non-empty after backoff',
      prev: { consecutiveEmptyPulls: 5, currentIntervalHours: 12, consecutiveErrors: 0 },
      outcome: 'non-empty',
      expected: { consecutiveEmptyPulls: 0, currentIntervalHours: 3 },
    },
    {
      name: 'error does not advance backoff',
      prev: { consecutiveEmptyPulls: 1, currentIntervalHours: 6, consecutiveErrors: 0 },
      outcome: 'error',
      expected: { consecutiveEmptyPulls: 1, currentIntervalHours: 6, consecutiveErrors: 1 },
    },
    {
      name: 'success clears errors',
      prev: { consecutiveEmptyPulls: 0, currentIntervalHours: 3, consecutiveErrors: 4 },
      outcome: 'non-empty',
      expected: { consecutiveErrors: 0 },
    },
  ]

  for (const c of cases) {
    it(c.name, () => {
      const next = advanceBackoff(makePrev(c.prev), c.outcome, NOW)
      for (const [k, v] of Object.entries(c.expected)) {
        expect(next[k as keyof State]).toBe(v)
      }
    })
  }
})
