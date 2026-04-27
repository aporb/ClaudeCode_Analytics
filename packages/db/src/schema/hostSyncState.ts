import { integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

export const hostSyncState = pgTable('host_sync_state', {
  host: text('host').primaryKey(),
  lastPulledAt: timestamp('last_pulled_at', { withTimezone: true }),
  lastHadDataAt: timestamp('last_had_data_at', { withTimezone: true }),
  currentIntervalHours: integer('current_interval_hours').notNull().default(3),
  consecutiveEmptyPulls: integer('consecutive_empty_pulls').notNull().default(0),
  lastError: text('last_error'),
  lastErrorAt: timestamp('last_error_at', { withTimezone: true }),
  consecutiveErrors: integer('consecutive_errors').notNull().default(0),
})
