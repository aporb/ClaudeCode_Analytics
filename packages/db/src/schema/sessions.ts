import { bigint, integer, numeric, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

export const sessions = pgTable('sessions', {
  sessionId: text('session_id').primaryKey(),
  projectPath: text('project_path'),
  startedAt: timestamp('started_at', { withTimezone: true }),
  endedAt: timestamp('ended_at', { withTimezone: true }),
  durationSec: integer('duration_sec'),
  messageCount: integer('message_count'),
  toolCallCount: integer('tool_call_count'),
  subagentCount: integer('subagent_count'),
  gitBranch: text('git_branch'),
  ccVersion: text('cc_version'),
  modelsUsed: text('models_used').array(),
  totalInputTokens: bigint('total_input_tokens', { mode: 'number' }),
  totalOutputTokens: bigint('total_output_tokens', { mode: 'number' }),
  totalCacheCreation: bigint('total_cache_creation', { mode: 'number' }),
  totalCacheRead: bigint('total_cache_read', { mode: 'number' }),
  estimatedCostUsd: numeric('estimated_cost_usd', { precision: 10, scale: 4 }),
  firstUserPrompt: text('first_user_prompt'),
  status: text('status'),
})
