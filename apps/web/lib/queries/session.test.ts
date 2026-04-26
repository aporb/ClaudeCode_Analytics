import { describe, expect, it } from 'vitest'
import { getDb } from '../db'
import { sql } from 'drizzle-orm'
import { getSessionStats, getSessionTopTools, getSessionFilesTouched, getSessionFirstPrompts } from './session'

async function pickSessionId(): Promise<string | null> {
  const db = getDb()
  const rows = await db.execute<{ session_id: string }>(sql`
    SELECT session_id FROM tool_calls GROUP BY session_id LIMIT 1
  `)
  return ((rows as unknown as Array<{ session_id: string }>)[0])?.session_id ?? null
}

describe('session queries', () => {
  it('getSessionStats returns numeric tokens and costByModel', async () => {
    const id = await pickSessionId()
    if (!id) return
    const s = await getSessionStats(id)
    expect(s.inputTokens).toBeGreaterThanOrEqual(0)
    expect(s.cacheHitPct).toBeGreaterThanOrEqual(0)
    expect(s.cacheHitPct).toBeLessThanOrEqual(1)
    expect(Array.isArray(s.costByModel)).toBe(true)
  })

  it('getSessionTopTools returns up to 5 rows', async () => {
    const id = await pickSessionId()
    if (!id) return
    const r = await getSessionTopTools(id, 5)
    expect(r.length).toBeLessThanOrEqual(5)
  })

  it('getSessionFilesTouched returns top + total', async () => {
    const id = await pickSessionId()
    if (!id) return
    const f = await getSessionFilesTouched(id, 5)
    expect(Array.isArray(f.top)).toBe(true)
    expect(typeof f.total).toBe('number')
  })

  it('getSessionFirstPrompts returns up to N rows', async () => {
    const id = await pickSessionId()
    if (!id) return
    const r = await getSessionFirstPrompts(id, 3)
    expect(r.length).toBeLessThanOrEqual(3)
  })
})
