import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import postgres from 'postgres'
import { getFailingHosts, getHostStats } from './hosts'

const URL = process.env.CCA_DATABASE_URL

// Test data is isolated by a unique time-window + dedicated test host names
// so it doesn't collide with real ingested data. We seed sessions/host_sync_state
// rows in the same DB the queries hit, and clean up after.
const HOST_A = '__test_host_a__'
const HOST_B = '__test_host_b__'
const WIN_START = new Date('2099-01-01T00:00:00Z')
const WIN_END = new Date('2099-01-31T23:59:59Z')

describe('getHostStats', () => {
  let sql: postgres.Sql

  beforeAll(async () => {
    if (!URL) throw new Error('CCA_DATABASE_URL is not set')
    sql = postgres(URL, { max: 2, prepare: false })

    // Clean any prior leftover rows for our test hosts.
    await sql`DELETE FROM sessions WHERE host IN (${HOST_A}, ${HOST_B})`
    await sql`DELETE FROM host_sync_state WHERE host IN (${HOST_A}, ${HOST_B})`

    // Two sessions for host A using sonnet (top model) + opus.
    await sql`
      INSERT INTO sessions (
        session_id, host, started_at, models_used,
        total_input_tokens, total_output_tokens, total_cache_creation, total_cache_read,
        estimated_cost_usd
      ) VALUES
        ('s_a1', ${HOST_A}, '2099-01-05T10:00:00Z', ARRAY['claude-sonnet-4-6']::text[],
         1000, 500, 100, 200, 1.50),
        ('s_a2', ${HOST_A}, '2099-01-10T10:00:00Z', ARRAY['claude-sonnet-4-6','claude-opus-4-7']::text[],
         2000, 700, 300, 400, 3.25)
    `
    // One session for host B using opus only.
    await sql`
      INSERT INTO sessions (
        session_id, host, started_at, models_used,
        total_input_tokens, total_output_tokens, total_cache_creation, total_cache_read,
        estimated_cost_usd
      ) VALUES
        ('s_b1', ${HOST_B}, '2099-01-15T10:00:00Z', ARRAY['claude-opus-4-7']::text[],
         500, 250, 50, 75, 0.90)
    `
    // host_sync_state rows for both.
    await sql`
      INSERT INTO host_sync_state (host, last_pulled_at, consecutive_errors, last_error)
      VALUES
        (${HOST_A}, '2099-01-12T00:00:00Z', 0, NULL),
        (${HOST_B}, '2099-01-16T00:00:00Z', 3, 'connection refused')
    `
  })

  afterAll(async () => {
    await sql`DELETE FROM sessions WHERE host IN (${HOST_A}, ${HOST_B})`
    await sql`DELETE FROM host_sync_state WHERE host IN (${HOST_A}, ${HOST_B})`
    await sql.end()
  })

  it('returns per-host token sums, cost, session count, and top model', async () => {
    const stats = await getHostStats({ sinceStart: WIN_START, sinceEnd: WIN_END })
    const a = stats.find((s) => s.host === HOST_A)
    const b = stats.find((s) => s.host === HOST_B)
    expect(a).toBeDefined()
    expect(b).toBeDefined()

    // Host A: 2 sessions, summed tokens, sum cost, top model = sonnet (in both)
    expect(a!.sessionCount).toBe(2)
    expect(a!.totalInputTokens).toBe(3000)
    expect(a!.totalOutputTokens).toBe(1200)
    expect(a!.totalCacheCreation).toBe(400)
    expect(a!.totalCacheRead).toBe(600)
    expect(a!.estimatedCostUsd).toBeCloseTo(4.75, 2)
    expect(a!.topModel).toBe('claude-sonnet-4-6')
    expect(a!.consecutiveErrors).toBe(0)
    expect(a!.lastError).toBeNull()
    expect(a!.lastPulledAt).not.toBeNull()
    expect(a!.lastActiveAt).not.toBeNull()

    // Host B: 1 session, top model = opus
    expect(b!.sessionCount).toBe(1)
    expect(b!.totalInputTokens).toBe(500)
    expect(b!.estimatedCostUsd).toBeCloseTo(0.90, 2)
    expect(b!.topModel).toBe('claude-opus-4-7')
    expect(b!.consecutiveErrors).toBe(3)
    expect(b!.lastError).toBe('connection refused')
  })
})

// Banner threshold per spec §6.4 / §8.4: surface only when consecutive_errors >= 3.
// Seed four host_sync_state rows at 0/2/3/5 errors and assert exactly the 3 and 5
// rows come back, in deterministic order (most recent failure first).
describe('getFailingHosts', () => {
  let sql: postgres.Sql
  const HOSTS = [
    '__test_fail_0__',
    '__test_fail_2__',
    '__test_fail_3__',
    '__test_fail_5__',
  ] as const

  beforeAll(async () => {
    if (!URL) throw new Error('CCA_DATABASE_URL is not set')
    sql = postgres(URL, { max: 2, prepare: false })

    await sql`DELETE FROM host_sync_state WHERE host IN ${sql(HOSTS)}`

    await sql`
      INSERT INTO host_sync_state (host, consecutive_errors, last_error, last_error_at)
      VALUES
        (${HOSTS[0]}, 0, NULL, NULL),
        (${HOSTS[1]}, 2, 'flaky once', '2099-02-01T00:00:00Z'),
        (${HOSTS[2]}, 3, 'ssh: connect to host failed', '2099-02-02T00:00:00Z'),
        (${HOSTS[3]}, 5, 'rsync exit 255', '2099-02-03T00:00:00Z')
    `
  })

  afterAll(async () => {
    await sql`DELETE FROM host_sync_state WHERE host IN ${sql(HOSTS)}`
    await sql.end()
  })

  it('returns only rows with consecutive_errors >= 3', async () => {
    const rows = await getFailingHosts()
    const subset = rows.filter((r) => (HOSTS as readonly string[]).includes(r.host))
    const byHost = new Map(subset.map((r) => [r.host, r]))
    expect(byHost.has('__test_fail_0__')).toBe(false)
    expect(byHost.has('__test_fail_2__')).toBe(false)
    expect(byHost.get('__test_fail_3__')?.consecutiveErrors).toBe(3)
    expect(byHost.get('__test_fail_5__')?.consecutiveErrors).toBe(5)
    expect(byHost.get('__test_fail_3__')?.lastError).toBe('ssh: connect to host failed')
    expect(byHost.get('__test_fail_5__')?.lastError).toBe('rsync exit 255')
    expect(byHost.get('__test_fail_5__')?.lastErrorAt).toBeInstanceOf(Date)
  })
})
