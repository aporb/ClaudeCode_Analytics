import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { sql } from 'drizzle-orm'
import type * as schema from '@cca/db/schema'

type Db = PostgresJsDatabase<typeof schema>

// Recomputes session rollups for a list of session_ids, joining events + messages + tool_calls
// and computing cost via model_pricing. This is idempotent and always correct.
export async function rollupSessions(db: Db, sessionIds: string[]): Promise<void> {
  if (sessionIds.length === 0) return
  await db.execute(sql`
    INSERT INTO sessions (
      session_id, project_path, started_at, ended_at, duration_sec,
      message_count, tool_call_count, subagent_count,
      git_branch, cc_version, models_used,
      total_input_tokens, total_output_tokens, total_cache_creation, total_cache_read,
      estimated_cost_usd, first_user_prompt, status
    )
    SELECT
      e.session_id,
      (array_agg(e.project_path) FILTER (WHERE e.project_path IS NOT NULL))[1] AS project_path,
      MIN(e.timestamp) AS started_at,
      MAX(e.timestamp) AS ended_at,
      EXTRACT(EPOCH FROM (MAX(e.timestamp) - MIN(e.timestamp)))::int AS duration_sec,
      COUNT(*) FILTER (WHERE e.type IN ('user','assistant')) AS message_count,
      (SELECT COUNT(*) FROM tool_calls tc WHERE tc.session_id = e.session_id) AS tool_call_count,
      COUNT(DISTINCT e.agent_id) FILTER (WHERE e.is_sidechain) AS subagent_count,
      (array_agg(e.git_branch) FILTER (WHERE e.git_branch IS NOT NULL))[1] AS git_branch,
      (array_agg(e.cc_version) FILTER (WHERE e.cc_version IS NOT NULL))[1] AS cc_version,
      ARRAY(
        SELECT DISTINCT m.model FROM messages m
        WHERE m.session_id = e.session_id AND m.model IS NOT NULL
      ) AS models_used,
      COALESCE(SUM(m.input_tokens), 0),
      COALESCE(SUM(m.output_tokens), 0),
      COALESCE(SUM(m.cache_creation_tokens), 0),
      COALESCE(SUM(m.cache_read_tokens), 0),
      (
        SELECT COALESCE(SUM(
            (m2.input_tokens::numeric / 1000000) * p.input_per_mtok
          + (m2.output_tokens::numeric / 1000000) * p.output_per_mtok
          + (m2.cache_creation_tokens::numeric / 1000000) * p.cache_write_5m_per_mtok
          + (m2.cache_read_tokens::numeric / 1000000) * p.cache_read_per_mtok
        ), 0)::numeric(10,4)
        FROM messages m2
        LEFT JOIN model_pricing p ON p.model = m2.model
        WHERE m2.session_id = e.session_id AND m2.role = 'assistant'
      ) AS estimated_cost_usd,
      (
        SELECT m3.text_content FROM messages m3
        WHERE m3.session_id = e.session_id AND m3.role = 'user'
        ORDER BY m3.timestamp ASC LIMIT 1
      ) AS first_user_prompt,
      'ended' AS status
    FROM events e
    LEFT JOIN messages m ON m.uuid = e.uuid
    WHERE e.session_id = ANY(ARRAY[${sql.join(sessionIds.map(id => sql`${id}`), sql`, `)}])
    GROUP BY e.session_id
    ON CONFLICT (session_id) DO UPDATE SET
      project_path       = EXCLUDED.project_path,
      started_at         = EXCLUDED.started_at,
      ended_at           = EXCLUDED.ended_at,
      duration_sec       = EXCLUDED.duration_sec,
      message_count      = EXCLUDED.message_count,
      tool_call_count    = EXCLUDED.tool_call_count,
      subagent_count     = EXCLUDED.subagent_count,
      git_branch         = EXCLUDED.git_branch,
      cc_version         = EXCLUDED.cc_version,
      models_used        = EXCLUDED.models_used,
      total_input_tokens = EXCLUDED.total_input_tokens,
      total_output_tokens= EXCLUDED.total_output_tokens,
      total_cache_creation=EXCLUDED.total_cache_creation,
      total_cache_read   = EXCLUDED.total_cache_read,
      estimated_cost_usd = EXCLUDED.estimated_cost_usd,
      first_user_prompt  = EXCLUDED.first_user_prompt,
      status             = EXCLUDED.status
  `)
}
