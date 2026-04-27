import { appendFileSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { config } from 'dotenv'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
const __dirname = dirname(fileURLToPath(import.meta.url))
config({ path: resolve(__dirname, '../../../.env.local') })

import * as schema from '@cca/db/schema'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { Broadcaster } from '../src/daemon/broadcaster.js'
import { ingestFileDelta } from '../src/daemon/liveIngest.js'

const TEST_URL = process.env.CCA_DATABASE_URL_TEST!
const sql = postgres(TEST_URL, { max: 2 })
const db = drizzle(sql, { schema })

describe('ingestFileDelta', () => {
  beforeAll(async () => {
    await sql`DELETE FROM events WHERE session_id = 'live-test'`
    await sql`DELETE FROM _ingest_cursors WHERE source_file LIKE '%cca-live-%'`
  })
  afterAll(async () => {
    await sql.end()
  })

  it('ingests new lines appended to a file since last cursor', async () => {
    const root = mkdtempSync(resolve(tmpdir(), 'cca-live-'))
    const file = resolve(root, 's.jsonl')
    writeFileSync(
      file,
      `{"uuid":"e0000000-0000-0000-0000-000000000200","type":"user","timestamp":"2026-04-01T00:00:00Z","sessionId":"live-test","message":{"role":"user","content":"hi"}}\n`,
    )

    const broadcaster = new Broadcaster()
    const seen: unknown[] = []
    broadcaster.subscribe((e) => seen.push(e))

    const r1 = await ingestFileDelta(db, file, broadcaster)
    expect(r1.newEvents).toBe(1)
    expect(r1.sessionIds).toContain('live-test')

    appendFileSync(
      file,
      `{"uuid":"e0000000-0000-0000-0000-000000000201","type":"assistant","timestamp":"2026-04-01T00:00:01Z","sessionId":"live-test","message":{"role":"assistant","model":"claude-sonnet-4-6","content":[{"type":"text","text":"hello"}],"usage":{"input_tokens":5,"output_tokens":2,"cache_creation_input_tokens":0,"cache_read_input_tokens":0}}}\n`,
    )

    const r2 = await ingestFileDelta(db, file, broadcaster)
    expect(r2.newEvents).toBe(1)

    const rows = await sql`SELECT COUNT(*) AS n FROM events WHERE session_id = 'live-test'`
    expect(Number(rows[0]?.n)).toBe(2)
    expect(seen.filter((e: any) => e.kind === 'event').length).toBeGreaterThanOrEqual(2)
  })

  it('is a no-op when called again without new data', async () => {
    const root = mkdtempSync(resolve(tmpdir(), 'cca-live-noop-'))
    const file = resolve(root, 's.jsonl')
    writeFileSync(
      file,
      `{"uuid":"e0000000-0000-0000-0000-000000000210","type":"user","timestamp":"2026-04-01T00:00:00Z","sessionId":"live-test","message":{"role":"user","content":"x"}}\n`,
    )
    const bc = new Broadcaster()
    await ingestFileDelta(db, file, bc)
    const again = await ingestFileDelta(db, file, bc)
    expect(again.newEvents).toBe(0)
  })
})
