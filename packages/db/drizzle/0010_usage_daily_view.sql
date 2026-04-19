CREATE MATERIALIZED VIEW IF NOT EXISTS usage_daily AS
SELECT
  date_trunc('day', m.timestamp)       AS day,
  s.project_path,
  m.model,
  COUNT(*)                             AS message_count,
  COALESCE(SUM(m.input_tokens), 0)     AS input_tokens,
  COALESCE(SUM(m.output_tokens), 0)    AS output_tokens,
  COALESCE(SUM(m.cache_creation_tokens), 0) AS cache_creation,
  COALESCE(SUM(m.cache_read_tokens), 0)     AS cache_read
FROM messages m
JOIN sessions s USING (session_id)
WHERE m.role = 'assistant'
GROUP BY 1, 2, 3;

CREATE UNIQUE INDEX IF NOT EXISTS usage_daily_unique ON usage_daily (day, project_path, model);
