import { resolve } from 'node:path'
import { config } from 'dotenv'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
config({ path: resolve(__dirname, '../../../.env.local') })

const TEST_URL = process.env.CCA_DATABASE_URL_TEST
if (!TEST_URL) throw new Error('CCA_DATABASE_URL_TEST required')

describe('schema: events', () => {
  let sql: postgres.Sql
  beforeAll(() => {
    sql = postgres(TEST_URL!, { max: 2 })
  })
  afterAll(async () => {
    await sql.end()
  })

  it('has events table with expected columns', async () => {
    const cols = await sql<Array<{ column_name: string; data_type: string }>>`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'events'
      ORDER BY ordinal_position
    `
    const names = cols.map((c) => c.column_name)
    expect(names).toEqual(
      expect.arrayContaining([
        'uuid',
        'session_id',
        'parent_uuid',
        'type',
        'subtype',
        'timestamp',
        'cwd',
        'project_path',
        'git_branch',
        'cc_version',
        'entrypoint',
        'is_sidechain',
        'agent_id',
        'request_id',
        'payload',
        'source_file',
        'ingested_at',
      ]),
    )
  })

  it('has sessions table', async () => {
    const cols = await sql<Array<{ column_name: string }>>`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'sessions' ORDER BY ordinal_position`
    expect(cols.map((c) => c.column_name)).toEqual(
      expect.arrayContaining([
        'session_id',
        'project_path',
        'started_at',
        'ended_at',
        'duration_sec',
        'message_count',
        'tool_call_count',
        'subagent_count',
        'git_branch',
        'cc_version',
        'models_used',
        'total_input_tokens',
        'total_output_tokens',
        'total_cache_creation',
        'total_cache_read',
        'estimated_cost_usd',
        'first_user_prompt',
        'status',
      ]),
    )
  })

  it('has messages table with tsvector column', async () => {
    const cols = await sql<Array<{ column_name: string; data_type: string }>>`
      SELECT column_name, data_type FROM information_schema.columns
      WHERE table_name = 'messages' ORDER BY ordinal_position`
    const byName = Object.fromEntries(cols.map((c) => [c.column_name, c.data_type]))
    expect(byName.text_tsv).toBe('tsvector')
    expect(byName.role).toBe('text')
  })

  it('has tool_calls table', async () => {
    const cols = await sql<Array<{ column_name: string }>>`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'tool_calls' ORDER BY ordinal_position`
    expect(cols.map((c) => c.column_name)).toEqual(
      expect.arrayContaining([
        'uuid',
        'session_id',
        'timestamp',
        'tool_name',
        'input',
        'result',
        'result_uuid',
        'duration_ms',
        'is_error',
        'parent_message_uuid',
      ]),
    )
  })

  it('has ancillary tables', async () => {
    const tables = await sql<Array<{ table_name: string }>>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' ORDER BY table_name`
    const names = tables.map((t) => t.table_name)
    expect(names).toEqual(
      expect.arrayContaining([
        'prompts_history',
        'todos',
        'file_snapshots',
        'shell_snapshots',
        'model_pricing',
        '_ingest_cursors',
      ]),
    )
  })
})
