import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import postgres from 'postgres'
import { config } from 'dotenv'
import { resolve } from 'node:path'
config({ path: resolve(__dirname, '../../../.env.local') })

const TEST_URL = process.env.CCA_DATABASE_URL_TEST
if (!TEST_URL) throw new Error('CCA_DATABASE_URL_TEST required')

describe('schema: events', () => {
  let sql: postgres.Sql
  beforeAll(() => { sql = postgres(TEST_URL!, { max: 2 }) })
  afterAll(async () => { await sql.end() })

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
        'uuid', 'session_id', 'parent_uuid', 'type', 'subtype',
        'timestamp', 'cwd', 'project_path', 'git_branch', 'cc_version',
        'entrypoint', 'is_sidechain', 'agent_id', 'request_id',
        'payload', 'source_file', 'ingested_at',
      ]),
    )
  })
})
