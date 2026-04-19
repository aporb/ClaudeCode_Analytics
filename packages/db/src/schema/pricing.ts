import { numeric, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

export const modelPricing = pgTable('model_pricing', {
  model: text('model').primaryKey(),
  inputPerMtok: numeric('input_per_mtok', { precision: 10, scale: 4 }),
  outputPerMtok: numeric('output_per_mtok', { precision: 10, scale: 4 }),
  cacheWrite5mPerMtok: numeric('cache_write_5m_per_mtok', { precision: 10, scale: 4 }),
  cacheWrite1hPerMtok: numeric('cache_write_1h_per_mtok', { precision: 10, scale: 4 }),
  cacheReadPerMtok: numeric('cache_read_per_mtok', { precision: 10, scale: 4 }),
  effectiveFrom: timestamp('effective_from', { withTimezone: true }),
})
