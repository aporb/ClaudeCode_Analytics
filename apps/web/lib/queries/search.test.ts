import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import postgres from 'postgres'
import { ftsSearch, countSearchResults } from './search'

// Test data is isolated by a unique time window + dedicated test host names
// + a unique search token so it doesn't collide with real ingested data.
// Mirrors the pattern used by hosts.test.ts and the getTokenTotals block in
// cost.test.ts: 2099 dates outside any real range, distinctive `__th_*__` host
// names, and a synthetic search keyword.
const TH_A = '__th_search_a__'
const TH_B = '__th_search_b__'
const KEYWORD = 'zzzqfooblargx' // very unlikely to appear in real messages
const TH_WIN = {
  start: new Date('2099-04-01T00:00:00Z'),
  end: new Date('2099-04-30T23:59:59Z'),
}
const URL = process.env.CCA_DATABASE_URL

// Matching event UUIDs (FK target) and message UUIDs (FK source).
const E_A1 = '00000000-0000-0000-0000-000000000a01'
const E_A2 = '00000000-0000-0000-0000-000000000a02'
const E_B1 = '00000000-0000-0000-0000-000000000b01'

describe('ftsSearch / countSearchResults — host filter + host on row', () => {
  let sql: postgres.Sql

  beforeAll(async () => {
    if (!URL) throw new Error('CCA_DATABASE_URL is not set')
    sql = postgres(URL, { max: 2, prepare: false })

    await sql`DELETE FROM messages WHERE uuid IN (${E_A1}::uuid, ${E_A2}::uuid, ${E_B1}::uuid)`
    await sql`DELETE FROM events WHERE uuid IN (${E_A1}::uuid, ${E_A2}::uuid, ${E_B1}::uuid)`
    await sql`DELETE FROM sessions WHERE host IN (${TH_A}, ${TH_B})`

    // Seed sessions for both hosts.
    await sql`
      INSERT INTO sessions (session_id, host, started_at, project_path, estimated_cost_usd)
      VALUES
        ('th_srch_a1', ${TH_A}, '2099-04-05T10:00:00Z', '/proj/a', 1.50),
        ('th_srch_a2', ${TH_A}, '2099-04-10T10:00:00Z', '/proj/a', 2.00),
        ('th_srch_b1', ${TH_B}, '2099-04-15T10:00:00Z', '/proj/b', 0.75)
    `

    // Seed events (FK target for messages.uuid).
    await sql`
      INSERT INTO events (uuid, session_id, type, timestamp, host, payload, source_file)
      VALUES
        (${E_A1}::uuid, 'th_srch_a1', 'message', '2099-04-05T10:00:00Z', ${TH_A}, '{}'::jsonb, 'test'),
        (${E_A2}::uuid, 'th_srch_a2', 'message', '2099-04-10T10:00:00Z', ${TH_A}, '{}'::jsonb, 'test'),
        (${E_B1}::uuid, 'th_srch_b1', 'message', '2099-04-15T10:00:00Z', ${TH_B}, '{}'::jsonb, 'test')
    `

    // Seed messages with the synthetic keyword in text_content.
    await sql`
      INSERT INTO messages (
        uuid, session_id, role, timestamp, model, text_content, host
      ) VALUES
        (${E_A1}::uuid, 'th_srch_a1', 'user', '2099-04-05T10:00:00Z', NULL,
          ${'hello ' + KEYWORD + ' world'}, ${TH_A}),
        (${E_A2}::uuid, 'th_srch_a2', 'assistant', '2099-04-10T10:00:00Z', 'claude-sonnet-4-6',
          ${'reply ' + KEYWORD + ' here'}, ${TH_A}),
        (${E_B1}::uuid, 'th_srch_b1', 'user', '2099-04-15T10:00:00Z', NULL,
          ${'another ' + KEYWORD + ' message'}, ${TH_B})
    `

    // Populate text_tsv (mirrors the post-insert UPDATE in
    // apps/ingester/src/writer/deriveMessages.ts).
    await sql`
      UPDATE messages
      SET text_tsv = to_tsvector('english', coalesce(text_content, ''))
      WHERE uuid IN (${E_A1}::uuid, ${E_A2}::uuid, ${E_B1}::uuid)
    `
  })

  afterAll(async () => {
    await sql`DELETE FROM messages WHERE uuid IN (${E_A1}::uuid, ${E_A2}::uuid, ${E_B1}::uuid)`
    await sql`DELETE FROM events WHERE uuid IN (${E_A1}::uuid, ${E_A2}::uuid, ${E_B1}::uuid)`
    await sql`DELETE FROM sessions WHERE host IN (${TH_A}, ${TH_B})`
    await sql.end()
  })

  it('returns host on every row when no host filter is applied', async () => {
    const rows = await ftsSearch({ q: KEYWORD, since: TH_WIN, limit: 50 })
    expect(rows.length).toBe(3)
    const hosts = rows.map((r) => r.host).sort()
    expect(hosts).toEqual([TH_A, TH_A, TH_B])
    for (const r of rows) expect(typeof r.host).toBe('string')
  })

  it('host filter narrows ftsSearch results to the given hosts', async () => {
    const rowsA = await ftsSearch({ q: KEYWORD, since: TH_WIN, hosts: [TH_A], limit: 50 })
    expect(rowsA.length).toBe(2)
    for (const r of rowsA) expect(r.host).toBe(TH_A)

    const rowsB = await ftsSearch({ q: KEYWORD, since: TH_WIN, hosts: [TH_B], limit: 50 })
    expect(rowsB.length).toBe(1)
    expect(rowsB[0]!.host).toBe(TH_B)
  })

  it('host filter narrows countSearchResults to the given hosts', async () => {
    const both = await countSearchResults({ q: KEYWORD, since: TH_WIN, hosts: [TH_A, TH_B] })
    const onlyA = await countSearchResults({ q: KEYWORD, since: TH_WIN, hosts: [TH_A] })
    const onlyB = await countSearchResults({ q: KEYWORD, since: TH_WIN, hosts: [TH_B] })
    expect(both).toBe(3)
    expect(onlyA).toBe(2)
    expect(onlyB).toBe(1)
  })

  it('null/empty host filter leaves results unrestricted', async () => {
    const rows = await ftsSearch({ q: KEYWORD, since: TH_WIN, hosts: null, limit: 50 })
    expect(rows.length).toBe(3)
  })
})
