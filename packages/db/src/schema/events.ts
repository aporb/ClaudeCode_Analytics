import { boolean, index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export const events = pgTable(
  'events',
  {
    uuid: uuid('uuid').primaryKey(),
    sessionId: text('session_id').notNull(),
    parentUuid: uuid('parent_uuid'),
    type: text('type').notNull(),
    subtype: text('subtype'),
    timestamp: timestamp('timestamp', { withTimezone: true }).notNull(),
    cwd: text('cwd'),
    projectPath: text('project_path'),
    gitBranch: text('git_branch'),
    ccVersion: text('cc_version'),
    entrypoint: text('entrypoint'),
    isSidechain: boolean('is_sidechain').default(false).notNull(),
    agentId: text('agent_id'),
    requestId: text('request_id'),
    payload: jsonb('payload').notNull(),
    sourceFile: text('source_file').notNull(),
    ingestedAt: timestamp('ingested_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('events_session_ts_idx').on(t.sessionId, t.timestamp),
    index('events_project_ts_idx').on(t.projectPath, t.timestamp.desc()),
    index('events_type_idx').on(t.type, t.subtype),
  ],
)
