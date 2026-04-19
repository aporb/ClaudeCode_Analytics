import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

import { config } from 'dotenv'
config({ path: resolve(__dirname, '../../../.env.local') })

import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import { events } from '@cca/db'
import { insertEventsBatch } from '../src/writer/events.js'
import type { ParsedEvent } from '@cca/core'

const TEST_URL = process.env.CCA_DATABASE_URL_TEST!
const sql = postgres(TEST_URL, { max: 2 })
const db = drizzle(sql, { schema: { events } })

const sample: ParsedEvent = {
  uuid: '00000000-0000-0000-0000-000000000001',
  sessionId: 's-test',
  parentUuid: null,
  type: 'user',
  subtype: 'user_message',
  timestamp: new Date('2026-04-01T00:00:00Z'),
  cwd: '/x',
  projectPath: '/x',
  gitBranch: 'main',
  ccVersion: '2.1.81',
  entrypoint: 'cli',
  isSidechain: false,
  agentId: null,
  requestId: null,
  payload: { uuid: '00000000-0000-0000-0000-000000000001' },
  sourceFile: '/tmp/test.jsonl',
}

describe('writer: events', () => {
  beforeAll(async () => {
    await sql`TRUNCATE events RESTART IDENTITY CASCADE`
  })
  afterAll(async () => { await sql.end() })

  it('inserts one event', async () => {
    const n = await insertEventsBatch(db, [sample])
    expect(n).toBe(1)
    const rows = await sql`SELECT uuid FROM events WHERE uuid = ${sample.uuid}`
    expect(rows).toHaveLength(1)
  })

  it('is idempotent on uuid conflict', async () => {
    const n = await insertEventsBatch(db, [sample, sample])
    expect(n).toBe(0)  // both conflict
  })

  it('inserts 1000 in one batch', async () => {
    const batch: ParsedEvent[] = Array.from({ length: 1000 }, (_, i) => ({
      ...sample,
      uuid: `00000000-0000-0000-0000-${String(i + 100).padStart(12, '0')}`,
    }))
    const n = await insertEventsBatch(db, batch)
    expect(n).toBe(1000)
  })
})
