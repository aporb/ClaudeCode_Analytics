import { bigint, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

export const ingestCursors = pgTable('_ingest_cursors', {
  sourceFile: text('source_file').primaryKey(),
  byteOffset: bigint('byte_offset', { mode: 'number' }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})
