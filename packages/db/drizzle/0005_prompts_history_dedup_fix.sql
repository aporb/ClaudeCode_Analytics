-- Fix: original unique constraint on (typed_at, display, project_path) fails for long displays.
-- Postgres B-tree index entries are limited to ~1/3 of an 8KB page.
-- Replace with a functional unique index using md5(display).

ALTER TABLE prompts_history DROP CONSTRAINT IF EXISTS prompts_history_dedupe;

CREATE UNIQUE INDEX IF NOT EXISTS prompts_history_dedupe_hash
  ON prompts_history (typed_at, md5(display), project_path);
