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

---

## 2026-04-27 — Multi-host ingest complete

Branch: `feat/multi-host-ingest`. 27 commits. Built overnight from spec → plan → subagent-per-task execution → live E2E.

### What was built

- **`host` column** added to all 8 event-derived tables (`events`, `sessions`, `messages`, `tool_calls`, `prompts_history`, `todos`, `file_snapshots`, `shell_snapshots`). `DEFAULT 'local'` backfills existing rows in a metadata-only `ALTER`. `usage_daily` materialized view rebuilt with `host` in the grouping.
- **`host_sync_state` table** — runtime state per host (last_pulled_at, current_interval_hours, consecutive_empty_pulls, consecutive_errors, last_error).
- **`apps/ingester/src/sync/`** — new module: Zod-validated `cca.remotes.json` registry parser, rsync runner with version-aware stdout parsing (3.x stats2 + 2.6.9 itemize fallback), per-host `flock`-based mutex (`proper-lockfile`), pure backoff state machine (3h → 6h → 12h, reset on new data), `host_sync_state` DB helpers, per-host run loop with DI for testability, `runSync` entry, `cca-ingester sync` subcommand.
- **`pnpm cca sync`** user-facing wrapper at `apps/cli/src/commands/sync.ts` with `--force`, `--host <name>`, `--reset-state <name>`. Imports `runSync` directly from `@cca/ingester/sync` (subpath export added).
- **`launchd` plist** at `infra/launchd/com.aporb.cca.sync.plist` with `StartInterval=10800` (3h). `scripts/install-sync.sh` / `uninstall-sync.sh` mirror the daemon scripts.
- **Web UI**: `parseHosts()` URL+cookie helper · `<HostFilter>` chip in nav (multi-select, URL-persisted) · `/hosts` page with per-host cards (token bar, cost, top model, last sync, sync health dot) · `<TokenHeadline>` on `/` (total + in/out/cache split) · `<HostChip>` on `/sessions`/`/search` rows · host badge on `/session/<id>` · `<SyncFailureBanner>` above nav (renders when ≥1 host has `consecutive_errors >= 3`, dismissible per-error-count via cookie).
- **`cca status`** extended with a per-host table (HOST / EVENTS / LAST PULLED / NEXT IN / HEALTH).

### Live E2E (rollout)

- First sync of `hostinger` (`root@wala-server`, 31 MB): **6,146 events / 44 sessions / 94 history / 174 file snapshots** ingested.
- First sync of `picoclaw` (`picoclaw` via `~/.ssh/config`): **3,803 events / 15 sessions / 81 history / 231 file snapshots** ingested.
- launchd plist loaded; next scheduled tick at ~08:30 EDT for both hosts.
- DB snapshot taken before migration: `~/Library/Logs/cca/claude_code-pre-multi-host-20260426-225033.dump` (1.08 GB).

### Test count and verification

- 113 root tests (was 98) + 66 web tests (was 49) = **179 total, all passing**.
- `pnpm typecheck` clean across all 6 workspaces.
- `pnpm --filter @cca/web build` succeeds with the new `/hosts` route.

### Issues found and fixed mid-rollout

1. **`pnpm db:migrate` allowlist missed `0011_multi_host.sql`** — `packages/db/src/migrate.ts` has a hardcoded list of hand-authored SQL files; updated to include the new one. (Pre-existing tech debt: `0005_prompts_history_dedup_fix.sql` re-apply has an unrelated bug.)
2. **`require('node:fs')` in ESM** — first task subagent took the plan literally; fixed to `import { readFileSync } from 'node:fs'`. Caught during live E2E, not by typecheck (tsx handled it via interop).
3. **`DISTINCT ON` + window function** in the `/hosts` SQL (CTE for top model per host) — Postgres rejects window-function aliases in `ORDER BY` of a `DISTINCT ON`. Wrapped the window in an inner subquery.
4. **Latent Date binding in `search.ts`** — query was passing raw `Date` objects into `db.execute(sql\`...\`)`; surfaced when host-filter tests ran. Fixed with `.toISOString()` + `::timestamptz` casts.
5. **`vi.fn` two-type-arg syntax deprecated in vitest 2.x** — fixed `vi.fn<[], Promise<...>>()` → `vi.fn<() => Promise<...>>()` in `SyncFailureBanner.test.tsx`.

### What this work deliberately did NOT do

- **No live SSE for remote events** — sync is batched (3h cadence with backoff to 6h/12h on empty pulls). The live indicator stays meaningful for *local* activity only.
- **No remote daemons** — pull-only via SSH+rsync from this Mac. No installs on the remotes.
- **No remote `status='active'`** — only the local hook-relay path can mark a session active.
- **No bidirectional sync** — pull-only.
- **No SSH key management** — relies on existing `~/.ssh/config` and zsh aliases.
- **No automated host-removal** — the registry-removal sequence (state row + 8 tables + mirror dir) is documented in `README.md` and `MORNING.md`; deliberately manual.

### Daemon autostart

The `~/.zshrc` daemon-autostart block is **commented out** during the build to prevent the running daemon from racing the schema migration. Restored before completion. The web-ui autostart was left running.

### Next

- Watch the first scheduled sync run (next tick ~3h after each host's last_pulled_at).
- The deferred `0005_prompts_history_dedup_fix.sql` re-apply bug is unrelated to this work but blocks fresh `pnpm db:migrate` runs; worth a follow-up.
- Optional: cross-host cost split chart on `/` (stacked-area-by-host instead of by-model). Not in scope here.

