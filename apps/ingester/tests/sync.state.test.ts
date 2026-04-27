import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { config } from 'dotenv'
const __dirname = dirname(fileURLToPath(import.meta.url))
config({ path: resolve(__dirname, '../../../.env.local') })

import postgres from 'postgres'
import { closeDb, getDb } from '@cca/db'
import { loadState, upsertState, resetState, listAllStates } from '../src/sync/state.js'

const TEST_URL = process.env.CCA_DATABASE_URL_TEST!

describe('sync/state DB helpers', () => {
  const sql = postgres(TEST_URL, { max: 2 })

  beforeAll(async () => {
    process.env.CCA_DATABASE_URL = TEST_URL // ensure getDb uses test DB
    await sql.unsafe('TRUNCATE host_sync_state RESTART IDENTITY CASCADE')
  })

  beforeEach(async () => {
    await sql.unsafe('TRUNCATE host_sync_state RESTART IDENTITY CASCADE')
  })

  afterAll(async () => {
    await closeDb()
    await sql.end()
  })

  it('loadState returns defaults when row absent', async () => {
    const db = getDb()
    const state = await loadState(db, 'no-such-host')
    expect(state.consecutiveEmptyPulls).toBe(0)
    expect(state.currentIntervalHours).toBe(3)
    expect(state.consecutiveErrors).toBe(0)
    expect(state.lastPulledAt).toBeNull()
    expect(state.lastHadDataAt).toBeNull()
    expect(state.lastError).toBeNull()
    expect(state.lastErrorAt).toBeNull()
  })

  it('upsertState persists then loadState returns the persisted values', async () => {
    const db = getDb()
    const now = new Date('2026-04-26T12:00:00Z')
    await upsertState(db, 'host-a', {
      consecutiveEmptyPulls: 2,
      currentIntervalHours: 12,
      consecutiveErrors: 1,
      lastPulledAt: now,
      lastHadDataAt: now,
      lastError: 'boom',
      lastErrorAt: now,
    })

    const got = await loadState(db, 'host-a')
    expect(got.consecutiveEmptyPulls).toBe(2)
    expect(got.currentIntervalHours).toBe(12)
    expect(got.consecutiveErrors).toBe(1)
    expect(got.lastPulledAt?.toISOString()).toBe(now.toISOString())
    expect(got.lastHadDataAt?.toISOString()).toBe(now.toISOString())
    expect(got.lastError).toBe('boom')
    expect(got.lastErrorAt?.toISOString()).toBe(now.toISOString())
  })

  it('upsertState updates existing row on conflict', async () => {
    const db = getDb()
    const t1 = new Date('2026-04-26T10:00:00Z')
    const t2 = new Date('2026-04-26T13:00:00Z')

    await upsertState(db, 'host-b', {
      consecutiveEmptyPulls: 1,
      currentIntervalHours: 6,
      consecutiveErrors: 0,
      lastPulledAt: t1,
      lastHadDataAt: t1,
      lastError: null,
      lastErrorAt: null,
    })

    await upsertState(db, 'host-b', {
      consecutiveEmptyPulls: 0,
      currentIntervalHours: 3,
      consecutiveErrors: 0,
      lastPulledAt: t2,
      lastHadDataAt: t2,
      lastError: null,
      lastErrorAt: null,
    })

    const got = await loadState(db, 'host-b')
    expect(got.consecutiveEmptyPulls).toBe(0)
    expect(got.currentIntervalHours).toBe(3)
    expect(got.lastPulledAt?.toISOString()).toBe(t2.toISOString())
  })

  it('resetState deletes the row; subsequent loadState returns defaults again', async () => {
    const db = getDb()
    const now = new Date('2026-04-26T12:00:00Z')
    await upsertState(db, 'host-c', {
      consecutiveEmptyPulls: 5,
      currentIntervalHours: 12,
      consecutiveErrors: 2,
      lastPulledAt: now,
      lastHadDataAt: now,
      lastError: 'err',
      lastErrorAt: now,
    })

    await resetState(db, 'host-c')

    const got = await loadState(db, 'host-c')
    expect(got.consecutiveEmptyPulls).toBe(0)
    expect(got.currentIntervalHours).toBe(3)
    expect(got.consecutiveErrors).toBe(0)
    expect(got.lastPulledAt).toBeNull()
    expect(got.lastHadDataAt).toBeNull()
    expect(got.lastError).toBeNull()
    expect(got.lastErrorAt).toBeNull()
  })

  it('listAllStates returns array of all states', async () => {
    const db = getDb()
    const now = new Date('2026-04-26T12:00:00Z')
    await upsertState(db, 'host-x', {
      consecutiveEmptyPulls: 1,
      currentIntervalHours: 6,
      consecutiveErrors: 0,
      lastPulledAt: now,
      lastHadDataAt: now,
      lastError: null,
      lastErrorAt: null,
    })
    await upsertState(db, 'host-y', {
      consecutiveEmptyPulls: 0,
      currentIntervalHours: 3,
      consecutiveErrors: 0,
      lastPulledAt: null,
      lastHadDataAt: null,
      lastError: null,
      lastErrorAt: null,
    })

    const all = await listAllStates(db)
    expect(all).toHaveLength(2)
    const hosts = all.map((s) => s.host).sort()
    expect(hosts).toEqual(['host-x', 'host-y'])
    const x = all.find((s) => s.host === 'host-x')!
    expect(x.consecutiveEmptyPulls).toBe(1)
    expect(x.currentIntervalHours).toBe(6)
  })
})
