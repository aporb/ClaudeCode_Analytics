# Status

## 2026-04-19 — Plan 1 (Foundation) complete

Branch: `feat/plan-1-foundation`. See `git log --oneline main..feat/plan-1-foundation` for commit list (~35 commits including the post-merge cleanups).

### What was built

- pnpm monorepo (`apps/ingester`, `packages/core`, `packages/parsers`, `packages/db`)
- `claude_code` database in the existing Supabase container (`localhost:54322`)
- 10 tables + 1 materialized view, 9 model_pricing rows seeded
- 6 pure parsers (JSONL streaming, transcripts incl. subagents, history, todos, file-history, shell-snapshots)
- Event-sourced writer pipeline: events → derived messages + tool_calls + sessions rollup + ancillary streams
- Backfill CLI (`pnpm backfill`) with cli-progress + p-limit concurrency + byte-offset cursors persisted to `_ingest_cursors`
- 39 tests across Drizzle schema, core utilities, parsers, and writer integrations — all green

### Backfill snapshot (post-run, 2026-04-19)

| Table             | Rows    |
|-------------------|---------|
| `events`          | 298,763 |
| `sessions`        |     517 |
| `messages`        | 220,927 |
| `tool_calls`      |  85,148 |
| `prompts_history` |   8,456 |
| `file_snapshots`  |   2,713 |
| `shell_snapshots` |     312 |
| `todos`           |   2,220 |

`claude_code` DB size: **2,835 MB**.

Top 3 models by estimated cost (backfill since ~Mar 2026):

| model                    | input tok  | output tok | cost USD  |
|--------------------------|-----------:|-----------:|----------:|
| claude-opus-4-6          |  9,202,765 | 39,823,566 | 22,800.64 |
| claude-haiku-4-5-20251001|  6,524,551 | 34,053,835 | 19,485.12 |
| claude-sonnet-4-6        |  2,268,418 | 25,669,365 | 13,527.36 |

Top 3 tools: `Read` (25,879 calls), `Bash` (21,905), `Edit` (8,897).

### Issues known but deferred

1. **Ingest errors: 12 JSONL files (~0.4%) failed with `unsupported Unicode escape sequence`.** These contain `\u0000` bytes embedded inside string values, which Postgres's JSONB type rejects. Sanitize in the parser on Plan 2: strip `\u0000` before JSON.parse or after.
2. **Project-path display is lossy.** `/Users/amynporb/Documents/_Projects/2026-books` flattens to `-Users-amynporb-Documents--Projects-2026-books` on disk, and the reverse heuristic produces `/Users/amynporb/Documents_Projects/2026/books`. The underlying `events.cwd` column preserves the real path verbatim — for accurate display in the future web UI, prefer `cwd` over `project_path`. See `docs/superpowers/specs/2026-04-19-claude-code-analytics-design.md` §11 & `packages/core/src/paths.ts` for the lossy-encoding notes.
3. **First-run "85 events" counter in orchestrator output was misleading.** It reflects rows newly inserted in the most recent re-run (the first run had partially populated `events` before crashing on prompts_history's oversized unique-index rows — since fixed via `0005_prompts_history_dedup_fix.sql`).
4. **Test isolation**: `vitest.config.ts` has `fileParallelism: false` to avoid TRUNCATE races between writer test files. Future improvement: switch remaining writer tests to scoped `DELETE WHERE session_id = ...` and re-enable parallelism.

### What Plan 1 deliberately did NOT do

- Live capture (chokidar tailer + launchd daemon) — Plan 2.
- `cca` CLI query commands (`status`, `sessions`, `replay`, `search`, `stats`) — Plan 2.
- Claude Code hook relay on `localhost:9939` — Plan 2.
- Next.js web UI (sessions list, replay, search, analytics) — Plan 3.

### Next

Write Plan 2 (live capture + CLI) once any bug-fix polish on Plan 1 is done.
