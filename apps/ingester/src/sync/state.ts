import { eq } from 'drizzle-orm'
import { hostSyncState } from '@cca/db'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type * as schema from '@cca/db/schema'
import type { BackoffInputState } from './backoff.js'

type Db = PostgresJsDatabase<typeof schema>

const DEFAULT_STATE: BackoffInputState = {
  consecutiveEmptyPulls: 0,
  currentIntervalHours: 3,
  consecutiveErrors: 0,
  lastPulledAt: null,
  lastHadDataAt: null,
  lastError: null,
  lastErrorAt: null,
}

export async function loadState(db: Db, host: string): Promise<BackoffInputState> {
  const rows = await db.select().from(hostSyncState).where(eq(hostSyncState.host, host)).limit(1)
  const r = rows[0]
  if (!r) return { ...DEFAULT_STATE }
  return {
    consecutiveEmptyPulls: r.consecutiveEmptyPulls,
    currentIntervalHours: r.currentIntervalHours,
    consecutiveErrors: r.consecutiveErrors,
    lastPulledAt: r.lastPulledAt,
    lastHadDataAt: r.lastHadDataAt,
    lastError: r.lastError,
    lastErrorAt: r.lastErrorAt,
  }
}

export async function upsertState(db: Db, host: string, state: BackoffInputState): Promise<void> {
  await db
    .insert(hostSyncState)
    .values({ host, ...state })
    .onConflictDoUpdate({
      target: hostSyncState.host,
      set: {
        consecutiveEmptyPulls: state.consecutiveEmptyPulls,
        currentIntervalHours: state.currentIntervalHours,
        consecutiveErrors: state.consecutiveErrors,
        lastPulledAt: state.lastPulledAt,
        lastHadDataAt: state.lastHadDataAt,
        lastError: state.lastError,
        lastErrorAt: state.lastErrorAt,
      },
    })
}

export async function resetState(db: Db, host: string): Promise<void> {
  await db.delete(hostSyncState).where(eq(hostSyncState.host, host))
}

export async function listAllStates(
  db: Db,
): Promise<Array<{ host: string } & BackoffInputState>> {
  const rows = await db.select().from(hostSyncState)
  return rows.map((r) => ({
    host: r.host,
    consecutiveEmptyPulls: r.consecutiveEmptyPulls,
    currentIntervalHours: r.currentIntervalHours,
    consecutiveErrors: r.consecutiveErrors,
    lastPulledAt: r.lastPulledAt,
    lastHadDataAt: r.lastHadDataAt,
    lastError: r.lastError,
    lastErrorAt: r.lastErrorAt,
  }))
}
