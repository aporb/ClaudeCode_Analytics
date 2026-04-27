-- Column additions. ADD COLUMN ... DEFAULT 'literal' is metadata-only on PG 11+;
-- existing rows automatically receive 'local' without a table rewrite.
-- IF NOT EXISTS makes this idempotent so `pnpm db:migrate` can be re-run safely.
ALTER TABLE events           ADD COLUMN IF NOT EXISTS host TEXT NOT NULL DEFAULT 'local';
ALTER TABLE sessions         ADD COLUMN IF NOT EXISTS host TEXT NOT NULL DEFAULT 'local';
ALTER TABLE messages         ADD COLUMN IF NOT EXISTS host TEXT NOT NULL DEFAULT 'local';
ALTER TABLE tool_calls       ADD COLUMN IF NOT EXISTS host TEXT NOT NULL DEFAULT 'local';
ALTER TABLE prompts_history  ADD COLUMN IF NOT EXISTS host TEXT NOT NULL DEFAULT 'local';
ALTER TABLE file_snapshots   ADD COLUMN IF NOT EXISTS host TEXT NOT NULL DEFAULT 'local';
ALTER TABLE shell_snapshots  ADD COLUMN IF NOT EXISTS host TEXT NOT NULL DEFAULT 'local';
ALTER TABLE todos            ADD COLUMN IF NOT EXISTS host TEXT NOT NULL DEFAULT 'local';

CREATE INDEX IF NOT EXISTS events_host_ts_idx        ON events   (host, timestamp DESC);
CREATE INDEX IF NOT EXISTS sessions_host_started_idx ON sessions (host, started_at DESC);

-- host_sync_state — runtime state per host, mutated by the sync runner.
CREATE TABLE IF NOT EXISTS host_sync_state (
  host                    TEXT PRIMARY KEY,
  last_pulled_at          TIMESTAMPTZ,
  last_had_data_at        TIMESTAMPTZ,
  current_interval_hours  INTEGER NOT NULL DEFAULT 3,
  consecutive_empty_pulls INTEGER NOT NULL DEFAULT 0,
  last_error              TEXT,
  last_error_at           TIMESTAMPTZ,
  consecutive_errors      INTEGER NOT NULL DEFAULT 0
);

-- Rebuild usage_daily with host in the grouping. The materialized view defined
-- in 0010_usage_daily_view.sql currently groups by (day, project_path, model);
-- without host in the key, every per-host token aggregate that hits the view
-- silently sums across hosts. Idempotent via DROP IF EXISTS + recreate.
DROP MATERIALIZED VIEW IF EXISTS usage_daily;
CREATE MATERIALIZED VIEW usage_daily AS
SELECT
  date_trunc('day', m.timestamp)            AS day,
  m.host                                    AS host,
  s.project_path                            AS project_path,
  m.model                                   AS model,
  COUNT(*)                                  AS message_count,
  COALESCE(SUM(m.input_tokens), 0)          AS input_tokens,
  COALESCE(SUM(m.output_tokens), 0)         AS output_tokens,
  COALESCE(SUM(m.cache_creation_tokens), 0) AS cache_creation,
  COALESCE(SUM(m.cache_read_tokens), 0)     AS cache_read
FROM messages m
JOIN sessions s USING (session_id)
WHERE m.role = 'assistant'
GROUP BY 1, 2, 3, 4;

CREATE UNIQUE INDEX IF NOT EXISTS usage_daily_unique ON usage_daily (day, host, project_path, model);
