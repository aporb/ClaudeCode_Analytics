-- Originally: ALTER TABLE "prompts_history" DROP CONSTRAINT "prompts_history_dedupe";
-- Made idempotent (IF EXISTS) so `pnpm db:migrate` is safe to re-run.
-- The replacement functional unique index lives in 0005_prompts_history_dedup_fix.sql.
ALTER TABLE "prompts_history" DROP CONSTRAINT IF EXISTS "prompts_history_dedupe";
