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
import { deriveToolCallsFromEvents } from '../src/writer/deriveToolCalls.js'
import type { ParsedEvent } from '@cca/core'

const TEST_URL = process.env.CCA_DATABASE_URL_TEST!
const sql = postgres(TEST_URL, { max: 2 })
const db = drizzle(sql, { schema })

const toolUseEvent: ParsedEvent = {
  uuid: '00000000-0000-0000-0000-000000000020',
  sessionId: 's-tool', parentUuid: null, type: 'assistant', subtype: 'assistant_message',
  timestamp: new Date('2026-04-01T00:00:00Z'),
  cwd: null, projectPath: null, gitBranch: null, ccVersion: null, entrypoint: null,
  isSidechain: false, agentId: null, requestId: null, sourceFile: '/x',
  payload: {
    uuid: '00000000-0000-0000-0000-000000000020',
    message: { role: 'assistant', content: [
      { type: 'tool_use', id: 'tu-1', name: 'Read', input: { file_path: '/x' } },
    ]},
  },
}

const toolResultEvent: ParsedEvent = {
  uuid: '00000000-0000-0000-0000-000000000021',
  sessionId: 's-tool', parentUuid: toolUseEvent.uuid, type: 'user', subtype: 'tool_result',
  timestamp: new Date('2026-04-01T00:00:00.500Z'),
  cwd: null, projectPath: null, gitBranch: null, ccVersion: null, entrypoint: null,
  isSidechain: false, agentId: null, requestId: null, sourceFile: '/x',
  payload: {
    uuid: '00000000-0000-0000-0000-000000000021',
    message: { role: 'user', content: [
      { type: 'tool_result', tool_use_id: 'tu-1', content: 'file body', is_error: false },
    ]},
  },
}

describe('derive tool_calls', () => {
  beforeAll(async () => {
    await sql`TRUNCATE events RESTART IDENTITY CASCADE`
  })
  afterAll(async () => { await sql.end() })

  it('pairs tool_use with tool_result and computes duration', async () => {
    await insertEventsBatch(db, [toolUseEvent, toolResultEvent], { host: 'local' })
    const n = await deriveToolCallsFromEvents(db, [toolUseEvent, toolResultEvent], { host: 'local' })
    expect(n).toBe(1)
    const rows = await sql`SELECT * FROM tool_calls WHERE uuid = ${toolUseEvent.uuid}`
    expect(rows[0]?.tool_name).toBe('Read')
    expect(Number(rows[0]?.duration_ms)).toBe(500)
    expect(rows[0]?.is_error).toBe(false)
    expect(rows[0]?.result_uuid).toBe(toolResultEvent.uuid)
  })

  it('stamps host on every inserted tool_call row', async () => {
    const useEvent: ParsedEvent = {
      ...toolUseEvent,
      uuid: '00000000-0000-0000-0000-000000000022',
      sessionId: 's-tool-htest',
      payload: {
        uuid: '00000000-0000-0000-0000-000000000022',
        message: { role: 'assistant', content: [
          { type: 'tool_use', id: 'tu-2', name: 'Read', input: { file_path: '/y' } },
        ]},
      },
    }
    const resultEvent: ParsedEvent = {
      ...toolResultEvent,
      uuid: '00000000-0000-0000-0000-000000000023',
      sessionId: 's-tool-htest',
      parentUuid: useEvent.uuid,
      payload: {
        uuid: '00000000-0000-0000-0000-000000000023',
        message: { role: 'user', content: [
          { type: 'tool_result', tool_use_id: 'tu-2', content: 'file body', is_error: false },
        ]},
      },
    }
    await insertEventsBatch(db, [useEvent, resultEvent], { host: 'h-test' })
    const n = await deriveToolCallsFromEvents(db, [useEvent, resultEvent], { host: 'h-test' })
    expect(n).toBe(1)
    const rows = await sql`SELECT host FROM tool_calls WHERE uuid = ${useEvent.uuid}`
    expect(rows[0]?.host).toBe('h-test')
  })
})
