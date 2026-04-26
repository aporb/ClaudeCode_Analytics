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

---

## 2026-04-19 — Plan 2 (Live capture + CLI) complete

Branch: `feat/plan-2-live-capture`. 24 commits since Plan 1.

### What was built

- **Live tailer daemon** (`apps/ingester/src/daemon/`): chokidar watcher + per-file debounce + delta ingest + Broadcaster pub/sub + HTTP server on `localhost:9939` (`/status`, `/hook`, `/events` SSE).
- **Hook helper**: `infra/hooks/cca-ping.sh` — bash ping invoked by CC hooks. Install/uninstall via `scripts/install-hooks.sh` / `scripts/uninstall-hooks.sh` (jq-based settings.json patching, preserves existing hooks like rtk).
- **launchd plist** (`infra/launchd/com.aporb.cca.ingester.plist`) + `scripts/install-daemon.sh` / `uninstall-daemon.sh`.
- **`cca` CLI** (`apps/cli/`): seven subcommands — `status`, `sessions`, `replay`, `search`, `stats`, `tail`, `open`.
- 54 tests across all workspaces — all green.
- Bug fix during E2E: `rollupSessions` was clobbering hook-set `active` status on every re-rollup. Fixed with `CASE WHEN sessions.status = 'active' THEN 'active' ELSE EXCLUDED.status END` — now session liveness survives transcript ingest.

### End-to-end verified

Manual smoke with real `~/.claude`:
- Daemon boots cleanly, `/status` reports `{ok:true, uptimeSec:3, subscribers:1}`.
- `pnpm cca status` → **300,156 events / 519 sessions / 2 active sessions**.
- `pnpm cca sessions --limit 3` → pretty-printed rows with status dots, durations, costs, first-prompt previews.
- `pnpm cca search "postgres migration"` → ranked matches with highlighted snippets via `ts_headline`.
- `pnpm cca stats --since 30d` → three aggregate tables (top models by cost, top projects, top tools with error rates).
- `pnpm cca tail` → SSE heartbeat on connect, status events streamed when hooks fire.

### Daemon ops quick-ref

- Manual start:  `pnpm --filter @cca/ingester exec tsx src/cli.ts daemon`
- launchd start: `launchctl load ~/Library/LaunchAgents/com.aporb.cca.ingester.plist` (see macOS caveat below)
- launchd stop:  `launchctl unload ~/Library/LaunchAgents/com.aporb.cca.ingester.plist`
- Status:        `curl -s http://localhost:9939/status | jq .`
- Tail logs:     `tail -f ~/Library/Logs/cca/daemon.log`

### New known issues

5. **macOS launchd is blocked by Full Disk Access protection.** The project lives under `~/Documents/`, which macOS guards: when launchd invokes `scripts/run-daemon.sh`, the OS returns `Operation not permitted` before the script can `cd` into the working directory. Two workarounds: (a) grant Full Disk Access to `/bin/bash` (or `/opt/homebrew/bin/pnpm`) via System Settings > Privacy & Security > Full Disk Access; or (b) run the daemon manually in a terminal when needed (`pnpm --filter @cca/ingester exec tsx src/cli.ts daemon`). Option (b) is fine for a dev tool; most users keep a terminal running anyway.
6. **Unicode-escape ingest errors (~0.4% of files)** persist from Plan 1 — still 12 files failing with `\u0000` inside JSON strings. Sanitize in parser as originally noted; not addressed here.
7. **Root `pnpm cca` script** was fixed mid-plan (was using `pnpm run cca --` which Commander treats as end-of-options). Now uses `pnpm --filter @cca/cli exec tsx src/bin.ts` which forwards args cleanly.

### What Plan 2 deliberately did NOT do

- Fix the unicode-escape parser issue (deferred from Plan 1).
- Resolve the path-decoding lossiness (also deferred).
- Provide a web UI — that's Plan 3.

### Next

**Plan 3 (Web UI)** — Next.js 16 App Router on `localhost:3939`. Sessions list, session detail / replay, search, analytics dashboard, live activity indicator via the daemon's SSE. Consider a polish pass first to sanitize `\u0000` in the parser and switch `project_path` derivation to `cwd`.

---

## 2026-04-19 — Plan 3 (Web UI) complete

Branch: `feat/plan-3-web-ui`. 16 tasks.

### What was built

- `apps/web` Next.js 16 App Router workspace on `localhost:3939`.
- Four routes: sessions list (`/`), session detail (`/session/<id>`), search (`/search`), stats (`/stats`).
- Tailwind 3 + shadcn/ui base components (button, card, input, badge, table).
- Server-rendered pages query Postgres directly via an HMR-safe `getDb()` singleton.
- Recharts for tokens-over-time line chart, top-tools and cost-by-project bar charts.
- Hand-rolled activity heatmap (13-week calendar grid).
- Live-activity indicator in the header — client component consuming the daemon's SSE via `EventSource`.
- Render-layer redaction for secrets with `?raw=1` URL toggle.

### What Plan 3 deliberately did NOT do

- No auth — localhost-only single-user.
- No user-editable saved views / dashboards.
- No write actions from the UI (read-only).
- No data export — use psql.

### Not included (polish ideas)

- Model-mix pie chart (deferred — tokens/cost already surface model info).
- Cache-hit-rate chart.
- Auto-refresh of session detail when the underlying session is still `active`.

### Next

System is feature-complete per the spec. Optional future: AI-assisted review ("summarize this session"), exports with redaction, multi-machine sync.

---

## 2026-04-26 — Dashboard redesign complete

Branch: `feat/dashboard-redesign`. 20 commits.

### What was built

- New IA: `/` is now a **cost command center**; sessions list moved to `/sessions`; `/stats` renamed **Behavior** in nav.
- **Global time picker** in nav (Today / 7d / 30d / 90d / All / Custom). URL + cookie persistence; default 7d. Custom popover takes ISO start+end and writes `?since=YYYY-MM-DD..YYYY-MM-DD`.
- Home page composition: 5-cell KPI strip (today/window/cache hit/top model/active) · stacked-area spend by model · rule-based briefing card · top-cost sessions · cost distribution P50/P95/P99 · cache hit trend · 24×7 active-hours heatmap (clamped to ≥30d).
- Session detail leads with **outcomes summary** (6-cell stat strip · top tools w/ error chip · files touched · cost split by model · first prompts) above a **collapsible replay** timeline. `?raw=1` and `?replay=1` toggles are orthogonal.
- Behavior page: tool error rate trend · prompt→response latency P50/P95 (sidechain excluded) · subagent depth histogram · token velocity scatter · cache hit by model.
- New per-route query modules in `apps/web/lib/queries/{cost,sessions,session,search,behavior}.ts`. Old monolithic `lib/queries.ts` removed.
- New `apps/web/lib/briefing.ts` rule engine (no LLM call).
- Three model color tokens in `globals.css` (`--model-opus`, `--model-sonnet`, `--model-haiku`) so chips/legends/charts agree everywhere.
- `apps/web/lib/since.ts` extended to support `today`, `all`, ISO-pair, plus `resolveSince() → {start, end, label}` helper used by every page.

### Test count and verification

- 58 tests across all workspaces (was 54 in Plan 2; web slice grew from 0 → 37: since/timeplugger/briefing/cost/session/behavior).
- Full typecheck clean across all six workspaces.
- E2E smoke verified all five routes return 200 against the live database; the model-filter URL params on `/sessions` and `/search` work correctly (a regression in the array binding pattern was caught and fixed during the E2E pass).

### What this redesign deliberately did NOT do

- No DB schema changes, no new mat-views.
- No auth, sharing, or per-user breakdowns (designed-as-if-org but single-user in v1).
- No settings page, no annotations, no exports.
- No pixel-snapshot tests (Vitest + RTL + real DB only).

