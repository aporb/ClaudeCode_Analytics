import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { cpSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { config } from 'dotenv'
const __dirname = dirname(fileURLToPath(import.meta.url))
config({ path: resolve(__dirname, '../../../.env.local') })

import postgres from 'postgres'
import { closeDb, getDb } from '@cca/db'
import { runHost } from '../src/sync/runHost.js'
import { upsertState, loadState } from '../src/sync/state.js'
import type { RsyncOutcome, RsyncVersion } from '../src/sync/rsync.js'
import type { RemoteEntry } from '../src/sync/config.js'

const TEST_URL = process.env.CCA_DATABASE_URL_TEST!
const FIXTURE_HOME = resolve(__dirname, 'fixtures/claude-home')
const PARSER_FIXTURES = resolve(__dirname, '../../../packages/parsers/tests/fixtures')

const RSYNC_VERSION: RsyncVersion = { major: 3, minor: 2 }

const REMOTE: RemoteEntry = {
  host: 'runhost-test',
  ssh: 'unused@localhost',
  claudeHome: '~/.claude',
}

describe('sync/runHost — per-host run loop', () => {
  const sql = postgres(TEST_URL, { max: 2 })
  const tempDirs: string[] = []

  function makeRepoRoot(): string {
    const dir = mkdtempSync(join(tmpdir(), 'cca-runhost-'))
    tempDirs.push(dir)
    return dir
  }

  beforeAll(async () => {
    process.env.CCA_DATABASE_URL = TEST_URL
    for (const t of [
      'events','messages','tool_calls','sessions','prompts_history','todos',
      'file_snapshots','shell_snapshots','_ingest_cursors','host_sync_state',
    ]) {
      await sql.unsafe(`TRUNCATE ${t} RESTART IDENTITY CASCADE`)
    }
    await sql`
      INSERT INTO model_pricing (model, input_per_mtok, output_per_mtok, cache_write_5m_per_mtok, cache_write_1h_per_mtok, cache_read_per_mtok, effective_from)
      VALUES ('claude-sonnet-4-6', 3, 15, 3.75, 6, 0.3, '2026-01-01T00:00:00Z')
      ON CONFLICT (model) DO NOTHING
    `
  })

  beforeEach(async () => {
    await sql.unsafe('TRUNCATE host_sync_state RESTART IDENTITY CASCADE')
    // Wipe any rows from prior scenarios that ingested under our test host so
    // assertions like "no events for this host" remain meaningful across cases.
    for (const t of [
      'events','messages','tool_calls','sessions','prompts_history','todos',
      'file_snapshots','shell_snapshots',
    ]) {
      await sql.unsafe(`DELETE FROM ${t} WHERE host = $1`, [REMOTE.host])
    }
    await sql.unsafe(`TRUNCATE _ingest_cursors RESTART IDENTITY CASCADE`)
  })

  afterAll(async () => {
    await closeDb()
    await sql.end()
    while (tempDirs.length > 0) {
      const d = tempDirs.pop()!
      try { rmSync(d, { recursive: true, force: true }) } catch { /* ignore */ }
    }
  })

  it('Scenario A: success-non-empty triggers ingest, resets backoff, sets lastHadDataAt', async () => {
    const repoRoot = makeRepoRoot()
    // Pre-seed the mirror with a real fixture so backfillAll has something to chew on.
    const claudeMirror = join(repoRoot, '.cca', 'remotes', REMOTE.host, '.claude')
    cpSync(FIXTURE_HOME, claudeMirror, { recursive: true })
    cpSync(join(PARSER_FIXTURES, 'file-history'), join(claudeMirror, 'file-history'), { recursive: true })
    cpSync(join(PARSER_FIXTURES, 'shell-snapshots'), join(claudeMirror, 'shell-snapshots'), { recursive: true })

    const rsyncFn = async (): Promise<RsyncOutcome> => ({
      kind: 'success-non-empty',
      stats: { filesTransferred: 7, bytesTransferred: 5432 },
      stdout: 'Number of regular files transferred: 7\n',
    })

    const db = getDb()
    const result = await runHost({ db, repoRoot, remote: REMOTE, rsyncVersion: RSYNC_VERSION, rsyncFn })

    expect(result.kind).toBe('ingested')
    if (result.kind !== 'ingested') return
    expect(result.host).toBe(REMOTE.host)
    expect(result.state.consecutiveEmptyPulls).toBe(0)
    expect(result.state.consecutiveErrors).toBe(0)
    expect(result.state.currentIntervalHours).toBe(3)
    expect(result.state.lastHadDataAt).not.toBeNull()
    expect(result.state.lastPulledAt).not.toBeNull()

    // Persisted state matches.
    const persisted = await loadState(db, REMOTE.host)
    expect(persisted.consecutiveEmptyPulls).toBe(0)
    expect(persisted.currentIntervalHours).toBe(3)
    expect(persisted.lastHadDataAt).not.toBeNull()

    // Sanity: backfillAll actually ran and stamped this host on rows.
    const evRows = await sql.unsafe(`SELECT count(*)::int AS n FROM events WHERE host = $1`, [REMOTE.host])
    expect((evRows[0] as { n: number }).n).toBeGreaterThan(0)
  }, 60_000)

  it('Scenario B: success-empty advances backoff, increments empty count, leaves lastHadDataAt unchanged', async () => {
    const repoRoot = makeRepoRoot()
    const db = getDb()

    // Pre-seed prior state with a recorded "had data" timestamp so we can prove it's untouched.
    const priorHadData = new Date('2026-04-01T00:00:00Z')
    const priorPulled = new Date('2026-04-25T00:00:00Z') // well in the past => due
    await upsertState(db, REMOTE.host, {
      consecutiveEmptyPulls: 0,
      currentIntervalHours: 3,
      consecutiveErrors: 0,
      lastPulledAt: priorPulled,
      lastHadDataAt: priorHadData,
      lastError: null,
      lastErrorAt: null,
    })

    const rsyncFn = async (): Promise<RsyncOutcome> => ({
      kind: 'success-empty',
      stats: { filesTransferred: 0, bytesTransferred: 0 },
      stdout: '',
    })

    const result = await runHost({ db, repoRoot, remote: REMOTE, rsyncVersion: RSYNC_VERSION, rsyncFn })

    expect(result.kind).toBe('skipped-empty')
    if (result.kind !== 'skipped-empty') return
    expect(result.state.consecutiveEmptyPulls).toBe(1)
    // After 1 consecutive empty pull, backoff table maps to 6h.
    expect(result.state.currentIntervalHours).toBe(6)
    expect(result.state.lastHadDataAt?.toISOString()).toBe(priorHadData.toISOString())

    const persisted = await loadState(db, REMOTE.host)
    expect(persisted.consecutiveEmptyPulls).toBe(1)
    expect(persisted.currentIntervalHours).toBe(6)
    expect(persisted.lastHadDataAt?.toISOString()).toBe(priorHadData.toISOString())
  }, 30_000)

  it('Scenario C: error increments error counter, leaves backoff cadence untouched, no ingest', async () => {
    const repoRoot = makeRepoRoot()
    const db = getDb()

    const rsyncFn = async (): Promise<RsyncOutcome> => ({
      kind: 'error',
      exitCode: 255,
      stderr: 'connection refused',
    })

    const result = await runHost({ db, repoRoot, remote: REMOTE, rsyncVersion: RSYNC_VERSION, rsyncFn })

    expect(result.kind).toBe('error')
    if (result.kind !== 'error') return
    expect(result.state.consecutiveErrors).toBe(1)
    expect(result.state.lastError).toContain('connection refused')
    // Backoff cadence (interval/empty-count) untouched on error.
    expect(result.state.consecutiveEmptyPulls).toBe(0)
    expect(result.state.currentIntervalHours).toBe(3)

    const persisted = await loadState(db, REMOTE.host)
    expect(persisted.consecutiveErrors).toBe(1)
    expect(persisted.lastError).toContain('connection refused')

    // No ingest happened — events should not have rows for this host.
    const evRows = await sql.unsafe(`SELECT count(*)::int AS n FROM events WHERE host = $1`, [REMOTE.host])
    expect((evRows[0] as { n: number }).n).toBe(0)
  }, 30_000)

  it('Scenario D: not-due skips; force=true bypasses the due check', async () => {
    const repoRoot = makeRepoRoot()
    const db = getDb()

    // Pre-seed: just pulled now, interval 3h => not due.
    const now = new Date()
    await upsertState(db, REMOTE.host, {
      consecutiveEmptyPulls: 0,
      currentIntervalHours: 3,
      consecutiveErrors: 0,
      lastPulledAt: now,
      lastHadDataAt: now,
      lastError: null,
      lastErrorAt: null,
    })

    let rsyncCalls = 0
    const rsyncFn = async (): Promise<RsyncOutcome> => {
      rsyncCalls += 1
      return { kind: 'success-empty', stats: { filesTransferred: 0, bytesTransferred: 0 }, stdout: '' }
    }

    const r1 = await runHost({ db, repoRoot, remote: REMOTE, rsyncVersion: RSYNC_VERSION, rsyncFn })
    expect(r1.kind).toBe('skipped-not-due')
    expect(rsyncCalls).toBe(0)

    const r2 = await runHost({ db, repoRoot, remote: REMOTE, rsyncVersion: RSYNC_VERSION, rsyncFn, force: true })
    expect(r2.kind).toBe('skipped-empty')
    expect(rsyncCalls).toBe(1)
  }, 30_000)
})
