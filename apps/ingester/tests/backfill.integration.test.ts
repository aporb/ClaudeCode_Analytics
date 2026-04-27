import { cpSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { config } from 'dotenv'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
const __dirname = dirname(fileURLToPath(import.meta.url))
config({ path: resolve(__dirname, '../../../.env.local') })

import { closeDb } from '@cca/db'
import postgres from 'postgres'
import { backfillAll } from '../src/backfill/orchestrator.js'

const TEST_URL = process.env.CCA_DATABASE_URL_TEST!
const FIXTURE_HOME = resolve(__dirname, 'fixtures/claude-home')
const PARSER_FIXTURES = resolve(__dirname, '../../../packages/parsers/tests/fixtures')

describe('backfill: host opt threading', () => {
  const sql = postgres(TEST_URL, { max: 2 })
  let tempHome: string

  beforeAll(async () => {
    process.env.CCA_DATABASE_URL = TEST_URL
    // Build a temp claude-home that includes transcripts/history/todos from the
    // existing fixture plus file-history and shell-snapshots from the parsers
    // fixtures, so all eight tables populate.
    tempHome = mkdtempSync(join(tmpdir(), 'cca-multihost-'))
    cpSync(FIXTURE_HOME, tempHome, { recursive: true })
    cpSync(join(PARSER_FIXTURES, 'file-history'), join(tempHome, 'file-history'), {
      recursive: true,
    })
    cpSync(join(PARSER_FIXTURES, 'shell-snapshots'), join(tempHome, 'shell-snapshots'), {
      recursive: true,
    })

    for (const t of [
      'events',
      'messages',
      'tool_calls',
      'sessions',
      'prompts_history',
      'todos',
      'file_snapshots',
      'shell_snapshots',
      '_ingest_cursors',
    ]) {
      await sql.unsafe(`TRUNCATE ${t} RESTART IDENTITY CASCADE`)
    }
    await sql`
      INSERT INTO model_pricing (model, input_per_mtok, output_per_mtok, cache_write_5m_per_mtok, cache_write_1h_per_mtok, cache_read_per_mtok, effective_from)
      VALUES ('claude-sonnet-4-6', 3, 15, 3.75, 6, 0.3, '2026-01-01T00:00:00Z')
      ON CONFLICT (model) DO NOTHING
    `
  })
  afterAll(async () => {
    await closeDb()
    await sql.end()
  })

  it('stamps host on every row across all 8 tables when host=hostinger', async () => {
    await backfillAll(tempHome, { concurrency: 2, host: 'hostinger' })

    // Tables we expect populated by the fixture; tool_calls is excluded because
    // the transcript fixtures contain no tool_use events.
    const populated = [
      'events',
      'sessions',
      'messages',
      'prompts_history',
      'todos',
      'file_snapshots',
      'shell_snapshots',
    ] as const
    for (const table of populated) {
      const rows = await sql.unsafe(`SELECT host FROM ${table}`)
      expect(
        rows.length,
        `${table} must have rows for the assertion to be meaningful`,
      ).toBeGreaterThan(0)
      expect(
        rows.every((r) => r.host === 'hostinger'),
        `every ${table}.host must be 'hostinger'`,
      ).toBe(true)
    }
    // tool_calls: assert nothing leaked in with the wrong host (table may be empty).
    const toolCalls = await sql`SELECT host FROM tool_calls`
    expect(
      toolCalls.every((r) => r.host === 'hostinger'),
      `every tool_calls.host must be 'hostinger'`,
    ).toBe(true)
  })
})
