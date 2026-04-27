import { sql } from 'drizzle-orm'
import { boolean, customType, index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { events } from './events.ts'

const tsvector = customType<{ data: string }>({
  dataType() { return 'tsvector' },
})

export const messages = pgTable(
  'messages',
  {
    uuid: uuid('uuid')
      .primaryKey()
      .references(() => events.uuid, { onDelete: 'cascade' }),
    sessionId: text('session_id').notNull(),
    role: text('role').notNull(), // 'user' | 'assistant'
    timestamp: timestamp('timestamp', { withTimezone: true }).notNull(),
    model: text('model'),
    textContent: text('text_content'),
    textTsv: tsvector('text_tsv'),
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    cacheCreationTokens: integer('cache_creation_tokens'),
    cacheReadTokens: integer('cache_read_tokens'),
    isSidechain: boolean('is_sidechain').default(false).notNull(),
    host: text('host').notNull().default('local'),
  },
  (t) => [index('messages_session_idx').on(t.sessionId, t.timestamp)],
)
