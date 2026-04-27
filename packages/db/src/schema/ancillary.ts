import {
  bigserial,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from 'drizzle-orm/pg-core'

export const promptsHistory = pgTable('prompts_history', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  projectPath: text('project_path'),
  display: text('display'),
  pastedContents: jsonb('pasted_contents'),
  typedAt: timestamp('typed_at', { withTimezone: true }),
  host: text('host').notNull().default('local'),
})
// Dedup uniqueness is enforced at the DB level by a functional unique index
// on (typed_at, md5(display), project_path) — see 0005_prompts_history_dedup_fix.sql.
// drizzle-kit can't express function-based indexes, so we don't define it here.

export const todos = pgTable(
  'todos',
  {
    sessionId: text('session_id').notNull(),
    agentId: text('agent_id').notNull(),
    snapshotAt: timestamp('snapshot_at', { withTimezone: true }).notNull(),
    todos: jsonb('todos').notNull(),
    host: text('host').notNull().default('local'),
  },
  (t) => [primaryKey({ columns: [t.sessionId, t.agentId, t.snapshotAt] })],
)

export const fileSnapshots = pgTable(
  'file_snapshots',
  {
    sessionId: text('session_id').notNull(),
    filePath: text('file_path').notNull(),
    version: integer('version').notNull(),
    snapshotAt: timestamp('snapshot_at', { withTimezone: true }),
    content: text('content'),
    sha256: text('sha256'),
    host: text('host').notNull().default('local'),
  },
  (t) => [primaryKey({ columns: [t.sessionId, t.filePath, t.version] })],
)

export const shellSnapshots = pgTable('shell_snapshots', {
  id: text('id').primaryKey(),
  capturedAt: timestamp('captured_at', { withTimezone: true }),
  content: text('content'),
  host: text('host').notNull().default('local'),
})
