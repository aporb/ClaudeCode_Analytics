import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { countSessions, listSessions } from './sessions'

// Test data is isolated by a unique time window + dedicated test host names
// so it doesn't collide with real ingested data. Mirrors the pattern used by
// hosts.test.ts and the getTokenTotals block in cost.test.ts: 2099 dates that
// fall outside any real session range, distinctive `__th_*__` host names.
const TH_A = '__th_sess_a__'
const TH_B = '__th_sess_b__'
const TH_WIN = {
  start: new Date('2099-03-01T00:00:00Z'),
  end: new Date('2099-03-31T23:59:59Z'),
}
const URL = process.env.CCA_DATABASE_URL

describe('listSessions / countSessions — host filter + host on row', () => {
  let sql: postgres.Sql

  beforeAll(async () => {
    if (!URL) throw new Error('CCA_DATABASE_URL is not set')
    sql = postgres(URL, { max: 2, prepare: false })
    await sql`DELETE FROM sessions WHERE host IN (${TH_A}, ${TH_B})`
    await sql`
      INSERT INTO sessions (
        session_id, host, started_at,
        total_input_tokens, total_output_tokens, total_cache_creation, total_cache_read,
        estimated_cost_usd
      ) VALUES
        ('th_sess_a1', ${TH_A}, '2099-03-05T10:00:00Z', 1000, 500, 100, 200, 1.50),
        ('th_sess_a2', ${TH_A}, '2099-03-10T10:00:00Z', 2000, 700, 300, 400, 3.25),
        ('th_sess_b1', ${TH_B}, '2099-03-15T10:00:00Z', 500, 250, 50, 75, 0.90)
    `
  })

  afterAll(async () => {
    await sql`DELETE FROM sessions WHERE host IN (${TH_A}, ${TH_B})`
    await sql.end()
  })

  it('returns host on every row when no host filter is applied', async () => {
    const rows = await listSessions({ since: TH_WIN, sortBy: 'recent', limit: 50 })
    const ours = rows.filter((r) => r.host === TH_A || r.host === TH_B)
    expect(ours.length).toBe(3)
    for (const r of ours) {
      expect(typeof r.host).toBe('string')
      expect(r.host.length).toBeGreaterThan(0)
    }
  })

  it('host filter narrows listSessions results to the given hosts', async () => {
    const rowsA = await listSessions({ since: TH_WIN, hosts: [TH_A], sortBy: 'recent', limit: 50 })
    const oursA = rowsA.filter((r) => r.host === TH_A || r.host === TH_B)
    expect(oursA.map((r) => r.sessionId).sort()).toEqual(['th_sess_a1', 'th_sess_a2'])
    for (const r of oursA) expect(r.host).toBe(TH_A)

    const rowsB = await listSessions({ since: TH_WIN, hosts: [TH_B], sortBy: 'recent', limit: 50 })
    const oursB = rowsB.filter((r) => r.host === TH_A || r.host === TH_B)
    expect(oursB.map((r) => r.sessionId)).toEqual(['th_sess_b1'])
    for (const r of oursB) expect(r.host).toBe(TH_B)
  })

  it('host filter narrows countSessions results to the given hosts', async () => {
    // Counts include real data, so compare deltas: with one host vs both.
    const both = await countSessions({ since: TH_WIN, hosts: [TH_A, TH_B] })
    const onlyA = await countSessions({ since: TH_WIN, hosts: [TH_A] })
    const onlyB = await countSessions({ since: TH_WIN, hosts: [TH_B] })
    expect(both).toBe(3)
    expect(onlyA).toBe(2)
    expect(onlyB).toBe(1)
  })

  it('null/empty host filter leaves results unrestricted', async () => {
    const rows = await listSessions({ since: TH_WIN, hosts: null, sortBy: 'recent', limit: 50 })
    const ours = rows.filter((r) => r.host === TH_A || r.host === TH_B)
    expect(ours.length).toBe(3)
  })
})
