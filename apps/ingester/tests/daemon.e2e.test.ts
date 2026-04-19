import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { config } from 'dotenv'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdtempSync, writeFileSync, appendFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
const __dirname = dirname(fileURLToPath(import.meta.url))
config({ path: resolve(__dirname, '../../../.env.local') })

import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import * as schema from '@cca/db/schema'
import { Broadcaster } from '../src/daemon/broadcaster.js'
import { startTailer } from '../src/daemon/tailer.js'
import { startServer } from '../src/daemon/server.js'

const TEST_URL = process.env.CCA_DATABASE_URL_TEST!
const sql = postgres(TEST_URL, { max: 2 })
const db = drizzle(sql, { schema })
const PORT = 19942

describe('daemon e2e', () => {
  beforeAll(async () => {
    await sql`DELETE FROM events WHERE session_id = 'e2e-test'`
    await sql`INSERT INTO sessions (session_id, status) VALUES ('e2e-test', 'idle')
      ON CONFLICT (session_id) DO UPDATE SET status = 'idle'`
  })
  afterAll(async () => { await sql.end() })

  it('ingests file changes + delivers via SSE + hook updates status', async () => {
    const home = mkdtempSync(resolve(tmpdir(), 'cca-e2e-'))
    mkdirSync(resolve(home, 'projects/-foo'), { recursive: true })
    const file = resolve(home, 'projects/-foo/s.jsonl')
    writeFileSync(file, '')

    const bc = new Broadcaster()
    const tailer = await startTailer({ claudeHome: home, db, broadcaster: bc, debounceMs: 50 })
    const server = await startServer({ port: PORT, db, broadcaster: bc, startedAt: Date.now() })

    const seen: string[] = []
    const controller = new AbortController()
    // wait for heartbeat so SSE subscription is established before we fire events
    let resolveReady!: () => void
    const ready = new Promise<void>((r) => { resolveReady = r })
    const sseTask = (async () => {
      const { consumeSse } = await import('../../cli/src/lib/sse-client.js')
      try {
        for await (const ev of consumeSse(`http://localhost:${PORT}/events`, controller.signal)) {
          seen.push(ev.event)
          if (ev.event === 'heartbeat') resolveReady()
        }
      } catch { /* aborted */ }
    })()
    await ready

    appendFileSync(file,
      `{"uuid":"e0000000-0000-0000-0000-000000000e2e","type":"user","timestamp":"2026-04-01T00:00:00Z","sessionId":"e2e-test","message":{"role":"user","content":"e2e"}}\n`
    )
    await fetch(`http://localhost:${PORT}/hook`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId: 'e2e-test', event: 'SessionStart' }),
    })

    await new Promise((r) => setTimeout(r, 700))

    const rows = await sql`SELECT COUNT(*) AS n FROM events WHERE session_id = 'e2e-test'`
    expect(Number(rows[0]!.n)).toBe(1)

    expect(seen).toContain('event')
    expect(seen).toContain('status')

    const st = await sql`SELECT status FROM sessions WHERE session_id = 'e2e-test'`
    expect(st[0]?.status).toBe('active')

    controller.abort()
    await Promise.race([sseTask, new Promise((r) => setTimeout(r, 100))])
    await tailer.stop()
    await server.stop()
  }, 10_000)
})
