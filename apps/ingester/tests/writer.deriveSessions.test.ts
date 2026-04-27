import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { config } from 'dotenv'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
const __dirname = dirname(fileURLToPath(import.meta.url))
config({ path: resolve(__dirname, '../../../.env.local') })

import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import * as schema from '@cca/db/schema'
import { insertEventsBatch } from '../src/writer/events.js'
import { deriveMessagesFromEvents } from '../src/writer/deriveMessages.js'
import { rollupSessions } from '../src/writer/deriveSessions.js'
import type { ParsedEvent } from '@cca/core'

const TEST_URL = process.env.CCA_DATABASE_URL_TEST!
const sql = postgres(TEST_URL, { max: 2 })
const db = drizzle(sql, { schema })

describe('rollup sessions', () => {
  beforeAll(async () => {
    await sql`DELETE FROM events WHERE session_id = 's-roll'`
    await sql`DELETE FROM sessions WHERE session_id = 's-roll'`
    // Seed pricing needed for estimated_cost_usd calculation
    await sql`
      INSERT INTO model_pricing (model, input_per_mtok, output_per_mtok, cache_write_5m_per_mtok, cache_write_1h_per_mtok, cache_read_per_mtok, effective_from)
      VALUES ('claude-sonnet-4-6', 3, 15, 3.75, 6, 0.3, '2026-01-01T00:00:00Z')
      ON CONFLICT (model) DO UPDATE SET
        input_per_mtok = EXCLUDED.input_per_mtok,
        output_per_mtok = EXCLUDED.output_per_mtok
    `
  })
  afterAll(async () => { await sql.end() })

  it('produces a session row with counts, tokens, and cost', async () => {
    const e1: ParsedEvent = {
      uuid: '00000000-0000-0000-0000-000000009001', sessionId: 's-roll', parentUuid: null,
      type: 'user', subtype: 'user_message', timestamp: new Date('2026-04-01T00:00:00Z'),
      cwd: '/p', projectPath: '/p', gitBranch: 'main', ccVersion: '2.1.81', entrypoint: 'cli',
      isSidechain: false, agentId: null, requestId: null, sourceFile: '/x',
      payload: { message: { role: 'user', content: 'first prompt' } },
    }
    const e2: ParsedEvent = {
      uuid: '00000000-0000-0000-0000-000000009002', sessionId: 's-roll', parentUuid: e1.uuid,
      type: 'assistant', subtype: 'assistant_message', timestamp: new Date('2026-04-01T00:01:00Z'),
      cwd: '/p', projectPath: '/p', gitBranch: 'main', ccVersion: '2.1.81', entrypoint: 'cli',
      isSidechain: false, agentId: null, requestId: null, sourceFile: '/x',
      payload: { message: {
        role: 'assistant', model: 'claude-sonnet-4-6',
        content: [{ type: 'text', text: 'ok' }],
        usage: { input_tokens: 1_000_000, output_tokens: 500_000, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
      }},
    }
    await insertEventsBatch(db, [e1, e2], { host: 'local' })
    await deriveMessagesFromEvents(db, [e1, e2], { host: 'local' })
    await rollupSessions(db, ['s-roll'])

    const rows = await sql`SELECT * FROM sessions WHERE session_id = 's-roll'`
    expect(rows).toHaveLength(1)
    expect(rows[0]?.message_count).toBe(2)
    expect(rows[0]?.project_path).toBe('/p')
    expect(Number(rows[0]?.total_input_tokens)).toBe(1_000_000)
    expect(Number(rows[0]?.total_output_tokens)).toBe(500_000)
    expect(Number(rows[0]?.estimated_cost_usd)).toBeCloseTo(10.5, 2) // 1M*3 + 0.5M*15
    expect(rows[0]?.first_user_prompt).toBe('first prompt')
  })

  it('derives sessions.host from events.host and is idempotent', async () => {
    await sql`DELETE FROM events WHERE session_id = 's-roll-host'`
    await sql`DELETE FROM sessions WHERE session_id = 's-roll-host'`

    const e1: ParsedEvent = {
      uuid: '00000000-0000-0000-0000-000000009101', sessionId: 's-roll-host', parentUuid: null,
      type: 'user', subtype: 'user_message', timestamp: new Date('2026-04-02T00:00:00Z'),
      cwd: '/p', projectPath: '/p', gitBranch: 'main', ccVersion: '2.1.81', entrypoint: 'cli',
      isSidechain: false, agentId: null, requestId: null, sourceFile: '/x',
      payload: { message: { role: 'user', content: 'hi' } },
    }
    const e2: ParsedEvent = {
      uuid: '00000000-0000-0000-0000-000000009102', sessionId: 's-roll-host', parentUuid: e1.uuid,
      type: 'assistant', subtype: 'assistant_message', timestamp: new Date('2026-04-02T00:01:00Z'),
      cwd: '/p', projectPath: '/p', gitBranch: 'main', ccVersion: '2.1.81', entrypoint: 'cli',
      isSidechain: false, agentId: null, requestId: null, sourceFile: '/x',
      payload: { message: {
        role: 'assistant', model: 'claude-sonnet-4-6',
        content: [{ type: 'text', text: 'ok' }],
        usage: { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
      }},
    }
    await insertEventsBatch(db, [e1, e2], { host: 'hostinger' })
    await deriveMessagesFromEvents(db, [e1, e2], { host: 'hostinger' })
    await rollupSessions(db, ['s-roll-host'])

    const rows1 = await sql`SELECT host FROM sessions WHERE session_id = 's-roll-host'`
    expect(rows1).toHaveLength(1)
    expect(rows1[0]?.host).toBe('hostinger')

    // Re-rollup: host should remain unchanged.
    await rollupSessions(db, ['s-roll-host'])
    const rows2 = await sql`SELECT host FROM sessions WHERE session_id = 's-roll-host'`
    expect(rows2[0]?.host).toBe('hostinger')
  })
})
