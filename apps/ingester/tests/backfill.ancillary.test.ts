import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { config } from 'dotenv'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
const __dirname = dirname(fileURLToPath(import.meta.url))
config({ path: resolve(__dirname, '../../../.env.local') })

import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import {
  promptsHistory, todos as todosTable, fileSnapshots, shellSnapshots,
} from '@cca/db'
import {
  ingestHistory, ingestTodos, ingestFileHistory, ingestShellSnapshots,
} from '../src/backfill/ancillary.js'

const TEST_URL = process.env.CCA_DATABASE_URL_TEST!
const sql = postgres(TEST_URL, { max: 2 })
const db = drizzle(sql, {
  schema: { promptsHistory, todos: todosTable, fileSnapshots, shellSnapshots },
})

// Reuse fixtures from packages/parsers/tests/fixtures
const PARSER_FIXTURES = resolve(__dirname, '../../../packages/parsers/tests/fixtures')
const HISTORY_FILE = resolve(PARSER_FIXTURES, 'history.jsonl')
const TODOS_DIR = resolve(PARSER_FIXTURES, 'todos')
const FILE_HISTORY_DIR = resolve(PARSER_FIXTURES, 'file-history')
const SHELL_SNAPSHOTS_DIR = resolve(PARSER_FIXTURES, 'shell-snapshots')

describe('backfill: ancillary writers stamp host', () => {
  beforeAll(async () => {
    await sql`TRUNCATE prompts_history, todos, file_snapshots, shell_snapshots RESTART IDENTITY CASCADE`
  })
  afterAll(async () => { await sql.end() })

  it('ingestHistory stamps host on every prompts_history row', async () => {
    const n = await ingestHistory(db, HISTORY_FILE, { host: 'h-test' })
    expect(n).toBeGreaterThan(0)
    const rows = await sql`SELECT host FROM prompts_history`
    expect(rows.length).toBe(n)
    expect(rows.every((r) => r.host === 'h-test')).toBe(true)
  })

  it('ingestTodos stamps host on every todos row', async () => {
    const n = await ingestTodos(db, TODOS_DIR, { host: 'h-test' })
    expect(n).toBeGreaterThan(0)
    const rows = await sql`SELECT host FROM todos`
    expect(rows.length).toBe(n)
    expect(rows.every((r) => r.host === 'h-test')).toBe(true)
  })

  it('ingestFileHistory stamps host on every file_snapshots row', async () => {
    const n = await ingestFileHistory(db, FILE_HISTORY_DIR, { host: 'h-test' })
    expect(n).toBeGreaterThan(0)
    const rows = await sql`SELECT host FROM file_snapshots`
    expect(rows.length).toBe(n)
    expect(rows.every((r) => r.host === 'h-test')).toBe(true)
  })

  it('ingestShellSnapshots stamps host on every shell_snapshots row', async () => {
    const n = await ingestShellSnapshots(db, SHELL_SNAPSHOTS_DIR, { host: 'h-test' })
    expect(n).toBeGreaterThan(0)
    const rows = await sql`SELECT host FROM shell_snapshots`
    expect(rows.length).toBe(n)
    expect(rows.every((r) => r.host === 'h-test')).toBe(true)
  })
})
