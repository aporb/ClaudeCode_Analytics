import { appendFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
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
import { startTailer } from '../src/daemon/tailer.js'

const TEST_URL = process.env.CCA_DATABASE_URL_TEST!
const sql = postgres(TEST_URL, { max: 2 })
const db = drizzle(sql, { schema })

describe('tailer', () => {
  beforeAll(async () => {
    await sql`DELETE FROM events WHERE session_id = 'tail-test'`
    await sql`DELETE FROM _ingest_cursors WHERE source_file LIKE '%cca-tailer-%'`
  })
  afterAll(async () => {
    await sql.end()
  })

  it('detects new lines appended to a watched JSONL file', async () => {
    const root = mkdtempSync(resolve(tmpdir(), 'cca-tailer-'))
    mkdirSync(resolve(root, 'projects/-x'), { recursive: true })
    const file = resolve(root, 'projects/-x/session.jsonl')
    writeFileSync(file, '')

    const bc = new Broadcaster()
    const seen: unknown[] = []
    bc.subscribe((e) => {
      if (e.kind === 'event') seen.push(e.payload)
    })

    const tailer = await startTailer({ claudeHome: root, db, broadcaster: bc, debounceMs: 50 })

    appendFileSync(
      file,
      `{"uuid":"e0000000-0000-0000-0000-000000000300","type":"user","timestamp":"2026-04-01T00:00:00Z","sessionId":"tail-test","message":{"role":"user","content":"live"}}\n`,
    )
    await new Promise((r) => setTimeout(r, 500))

    const rows = await sql`SELECT COUNT(*) AS n FROM events WHERE session_id = 'tail-test'`
    expect(Number(rows[0]?.n)).toBe(1)
    expect(seen.length).toBeGreaterThanOrEqual(1)

    await tailer.stop()
  })
})
