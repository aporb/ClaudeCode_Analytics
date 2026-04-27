import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { config } from 'dotenv'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
const __dirname = dirname(fileURLToPath(import.meta.url))
config({ path: resolve(__dirname, '../../../.env.local') })

import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import { events, messages } from '@cca/db'
import { insertEventsBatch } from '../src/writer/events.js'
import { deriveMessagesFromEvents } from '../src/writer/deriveMessages.js'
import type { ParsedEvent } from '@cca/core'

const TEST_URL = process.env.CCA_DATABASE_URL_TEST!
const sql = postgres(TEST_URL, { max: 2 })
const db = drizzle(sql, { schema: { events, messages } })

const assistantEvent: ParsedEvent = {
  uuid: '00000000-0000-0000-0000-000000000010',
  sessionId: 's-derive',
  parentUuid: null,
  type: 'assistant',
  subtype: 'assistant_message',
  timestamp: new Date('2026-04-01T00:00:00Z'),
  cwd: null, projectPath: null, gitBranch: null, ccVersion: null, entrypoint: null,
  isSidechain: false, agentId: null, requestId: 'req1',
  sourceFile: '/tmp/x.jsonl',
  payload: {
    uuid: '00000000-0000-0000-0000-000000000010',
    message: {
      role: 'assistant',
      model: 'claude-sonnet-4-6',
      content: [
        { type: 'text', text: 'Hello world.' },
        { type: 'tool_use', id: 'tu1', name: 'Read', input: {} },
      ],
      usage: {
        input_tokens: 100,
        output_tokens: 20,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 50,
      },
    },
  },
}

describe('derive messages', () => {
  beforeAll(async () => {
    await sql`TRUNCATE events RESTART IDENTITY CASCADE`
  })
  afterAll(async () => { await sql.end() })

  it('inserts a message row with flattened text and usage', async () => {
    await insertEventsBatch(db, [assistantEvent], { host: 'local' })
    const n = await deriveMessagesFromEvents(db, [assistantEvent], { host: 'local' })
    expect(n).toBe(1)
    const rows = await sql`SELECT * FROM messages WHERE uuid = ${assistantEvent.uuid}`
    expect(rows[0]?.role).toBe('assistant')
    expect(rows[0]?.model).toBe('claude-sonnet-4-6')
    expect(rows[0]?.text_content).toBe('Hello world.')
    expect(Number(rows[0]?.input_tokens)).toBe(100)
    expect(Number(rows[0]?.output_tokens)).toBe(20)
    expect(Number(rows[0]?.cache_read_tokens)).toBe(50)
  })

  it('stamps host on every inserted message row', async () => {
    const picoEvent: ParsedEvent = {
      ...assistantEvent,
      uuid: '00000000-0000-0000-0000-000000000011',
      sessionId: 's-derive-pico',
      payload: {
        ...assistantEvent.payload,
        uuid: '00000000-0000-0000-0000-000000000011',
      } as ParsedEvent['payload'],
    }
    await insertEventsBatch(db, [picoEvent], { host: 'picoclaw' })
    const n = await deriveMessagesFromEvents(db, [picoEvent], { host: 'picoclaw' })
    expect(n).toBe(1)
    const rows = await sql`SELECT host FROM messages WHERE uuid = ${picoEvent.uuid}`
    expect(rows[0]?.host).toBe('picoclaw')
  })
})
