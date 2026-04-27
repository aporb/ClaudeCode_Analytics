import { boolean, index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { events } from './events.ts'

export const toolCalls = pgTable(
  'tool_calls',
  {
    uuid: uuid('uuid')
      .primaryKey()
      .references(() => events.uuid, { onDelete: 'cascade' }),
    sessionId: text('session_id').notNull(),
    timestamp: timestamp('timestamp', { withTimezone: true }).notNull(),
    toolName: text('tool_name').notNull(),
    input: jsonb('input'),
    result: jsonb('result'),
    resultUuid: uuid('result_uuid'),
    durationMs: integer('duration_ms'),
    isError: boolean('is_error'),
    parentMessageUuid: uuid('parent_message_uuid'),
    host: text('host').notNull().default('local'),
  },
  (t) => [
    index('tool_calls_name_idx').on(t.toolName, t.timestamp.desc()),
    index('tool_calls_session_idx').on(t.sessionId, t.timestamp),
  ],
)
