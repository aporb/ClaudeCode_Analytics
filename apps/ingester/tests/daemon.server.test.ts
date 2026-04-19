import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { config } from 'dotenv'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
const __dirname = dirname(fileURLToPath(import.meta.url))
config({ path: resolve(__dirname, '../../../.env.local') })

import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import * as schema from '@cca/db/schema'
import { Broadcaster } from '../src/daemon/broadcaster.js'
import { startServer } from '../src/daemon/server.js'

const TEST_URL = process.env.CCA_DATABASE_URL_TEST!
const sql = postgres(TEST_URL, { max: 2 })
const db = drizzle(sql, { schema })
const PORT = 19939

describe('daemon server', () => {
  let stop: () => Promise<void>
  const bc = new Broadcaster()

  beforeAll(async () => {
    await sql`INSERT INTO sessions (session_id, status) VALUES ('hook-test', NULL) ON CONFLICT (session_id) DO UPDATE SET status = NULL`
    const s = await startServer({ port: PORT, db, broadcaster: bc, startedAt: Date.now() })
    stop = s.stop
  })
  afterAll(async () => { await stop(); await sql.end() })

  it('GET /status returns JSON', async () => {
    const res = await fetch(`http://localhost:${PORT}/status`)
    expect(res.status).toBe(200)
    const body = await res.json() as { ok: boolean; uptimeSec: number; subscribers: number }
    expect(body.ok).toBe(true)
    expect(typeof body.uptimeSec).toBe('number')
  })

  it('POST /hook updates session status and republishes', async () => {
    const seen: unknown[] = []
    const unsub = bc.subscribe((e) => { if (e.kind === 'status') seen.push(e.payload) })
    const res = await fetch(`http://localhost:${PORT}/hook`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId: 'hook-test', event: 'SessionStart' }),
    })
    expect(res.status).toBe(204)
    const rows = await sql`SELECT status FROM sessions WHERE session_id = 'hook-test'`
    expect(rows[0]?.status).toBe('active')
    expect(seen).toHaveLength(1)
    unsub()
  })

  it('POST /hook with SessionEnd marks ended', async () => {
    await fetch(`http://localhost:${PORT}/hook`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId: 'hook-test', event: 'SessionEnd' }),
    })
    const rows = await sql`SELECT status FROM sessions WHERE session_id = 'hook-test'`
    expect(rows[0]?.status).toBe('ended')
  })

  it('GET /events streams server-sent events', async () => {
    const controller = new AbortController()
    const res = await fetch(`http://localhost:${PORT}/events`, { signal: controller.signal })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/event-stream')

    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    setTimeout(() => bc.publish({ kind: 'event', payload: { uuid: 't' } }), 50)
    const { value } = await reader.read()
    const text = decoder.decode(value)
    expect(text).toMatch(/event: (event|heartbeat)/)
    controller.abort()
  })
})
