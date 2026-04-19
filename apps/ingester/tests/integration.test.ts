import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { config } from 'dotenv'
const __dirname = dirname(fileURLToPath(import.meta.url))
config({ path: resolve(__dirname, '../../../.env.local') })

import postgres from 'postgres'
import { backfillAll } from '../src/backfill/orchestrator.js'
import { closeDb } from '@cca/db'

const TEST_URL = process.env.CCA_DATABASE_URL_TEST!
const FIXTURE_HOME = resolve(__dirname, 'fixtures/claude-home')

describe('end-to-end backfill', () => {
  const sql = postgres(TEST_URL, { max: 2 })
  beforeAll(async () => {
    process.env.CCA_DATABASE_URL = TEST_URL  // ensure getDb uses test DB
    for (const t of ['events','messages','tool_calls','sessions','prompts_history','todos','file_snapshots','shell_snapshots','_ingest_cursors']) {
      await sql.unsafe(`TRUNCATE ${t} RESTART IDENTITY CASCADE`)
    }
    // Seed a pricing row so cost calculation works (model_pricing may not be seeded in test DB)
    await sql`
      INSERT INTO model_pricing (model, input_per_mtok, output_per_mtok, cache_write_5m_per_mtok, cache_write_1h_per_mtok, cache_read_per_mtok, effective_from)
      VALUES ('claude-sonnet-4-6', 3, 15, 3.75, 6, 0.3, '2026-01-01T00:00:00Z')
      ON CONFLICT (model) DO NOTHING
    `
  })
  afterAll(async () => { await closeDb(); await sql.end() })

  it('ingests fixture home end-to-end', async () => {
    await backfillAll(FIXTURE_HOME, { concurrency: 2 })

    const events = await sql`SELECT COUNT(*) AS n FROM events`
    expect(Number(events[0]!.n)).toBeGreaterThanOrEqual(3)   // 2 main + 1 subagent

    const msgs = await sql`SELECT COUNT(*) AS n FROM messages`
    expect(Number(msgs[0]!.n)).toBeGreaterThanOrEqual(3)

    const sess = await sql`SELECT * FROM sessions WHERE session_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'`
    expect(sess).toHaveLength(1)
    expect(sess[0]?.subagent_count).toBeGreaterThanOrEqual(1)
    expect(sess[0]?.project_path).toBe('/Users/x/proj')
    expect(Number(sess[0]?.total_input_tokens)).toBe(100)

    const hist = await sql`SELECT COUNT(*) AS n FROM prompts_history`
    expect(Number(hist[0]!.n)).toBe(1)

    const cursors = await sql`SELECT COUNT(*) AS n FROM _ingest_cursors`
    expect(Number(cursors[0]!.n)).toBe(2)   // one per transcript file
  })

  it('is idempotent on re-run', async () => {
    const before = await sql`SELECT COUNT(*) AS n FROM events`
    await backfillAll(FIXTURE_HOME, { concurrency: 2 })
    const after = await sql`SELECT COUNT(*) AS n FROM events`
    expect(after[0]!.n).toEqual(before[0]!.n)
  })
})
