# Claude Code Analytics (`cca`)

Logs every Claude Code session on this machine to Postgres and lets you review it locally — sessions list, replay, full-text search, and stats.

Three plans, all complete and merged to `main`:

1. **Foundation** — Postgres schema, parsers for `~/.claude` JSONL/JSON files, backfill CLI.
2. **Live capture + CLI** — `chokidar` tailer daemon on `localhost:9939`, hook ping endpoint, `cca` CLI (`status`, `sessions`, `replay`, `search`, `stats`, `tail`, `open`).
3. **Web UI** — Next.js 16 App Router on `localhost:3939` with sessions list, session detail/replay, search, stats.

See `STATUS.md` for the per-plan snapshot of what shipped and `docs/superpowers/specs/2026-04-19-claude-code-analytics-design.md` for the full design.

## Architecture at a glance

```
~/.claude/                          (Claude Code's transcript dir)
   ├─ projects/*.jsonl              (turn-by-turn events)
   ├─ history.jsonl, todos/, ...
   │
   ▼   chokidar tailer + parsers (apps/ingester/src/daemon)
┌──────────────┐
│  cca daemon  │ :9939   ──► /status, /hook, /events (SSE)
└──────┬───────┘
       │ writes
       ▼
┌──────────────┐
│  Postgres    │ :54322  (Supabase container on this machine)
│  claude_code │
└──────┬───────┘
       ├──► `cca` CLI (terminal)
       └──► Next.js web UI :3939
```

Two long-running processes: the **daemon** (Node, ingest) and the **web** (Next.js dev server, UI).
Both are started automatically on first terminal open via snippets in `~/.zshrc` (see [Auto-start](#auto-start)).

## Prerequisites

- macOS (this setup is macOS-specific because of the launchd/zshrc choices and `~/.claude` path).
- Node 22+ and pnpm 9+ (`corepack enable && corepack prepare pnpm@latest --activate`).
- Docker Desktop running with the existing Supabase container `supabase_db_mission-control-saas` exposing Postgres 17 on `localhost:54322`.
- `.env.local` at the repo root:

  ```bash
  CCA_DATABASE_URL=postgresql://postgres:postgres@localhost:54322/claude_code
  CCA_DATABASE_URL_TEST=postgresql://postgres:postgres@localhost:54322/claude_code_test
  CLAUDE_HOME=/Users/<you>/.claude
  ```

  See `.env.example` for the shape.

## First-time setup

```bash
pnpm install

# Create the two databases in your existing Supabase container
psql postgresql://postgres:postgres@localhost:54322/postgres -f infra/docker/create-db.sql

# Apply Drizzle migrations + raw SQL supplements
pnpm db:migrate

# Seed model_pricing (Claude 4.x rates)
pnpm db:seed

# One-shot backfill of everything under $CLAUDE_HOME
pnpm backfill

# Install the Claude Code hook so live sessions ping the daemon
./scripts/install-hooks.sh
```

## Auto-start

Two snippets at the bottom of `~/.zshrc` make sure both services come up the next time a terminal is opened after login. Each is idempotent — it only launches a new process when one isn't already there.

```bash
# Claude Code Analytics — auto-start daemon on first terminal open after login
if ! pgrep -f "cca/ingester.*cli\.ts daemon" > /dev/null 2>&1; then
  (
    cd /Users/<you>/Documents/_Projects/ClaudeCode_Analytics || exit 0
    mkdir -p ~/Library/Logs/cca
    nohup pnpm --filter @cca/ingester exec tsx src/cli.ts daemon \
      >> ~/Library/Logs/cca/daemon.log 2>&1 &
    disown
  ) &>/dev/null
fi

# Claude Code Analytics — auto-start web UI (Next.js on :3939)
if ! pgrep -f "next dev .*-p 3939" > /dev/null 2>&1; then
  (
    cd /Users/<you>/Documents/_Projects/ClaudeCode_Analytics || exit 0
    mkdir -p ~/Library/Logs/cca
    nohup pnpm --filter @cca/web dev \
      >> ~/Library/Logs/cca/web.log 2>&1 &
    disown
  ) &>/dev/null
fi
```

**Why `.zshrc` and not `launchd`?** macOS Full Disk Access blocks `launchd`-spawned processes from reading `~/Documents/`, where this repo lives. An interactive shell inherits FDA from your user session, so the daemon Just Works when launched from a terminal. The cost is that you need to open a terminal at least once after login (which you do anyway).

**Why dev mode for the web?** `next dev` tolerates code changes without a rebuild and recovers cleanly from errors. For a slightly faster cold start, run `pnpm --filter @cca/web build` once and swap the `dev` snippet to `start`.

## Daily operation

### Is it running?

```bash
curl -sS http://localhost:9939/status | jq .
# { ok: true, uptimeSec: 312, subscribers: 0, lastEventAt: "2026-04-26T13:03:11.558Z" }

curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3939/
# 200
```

Or just run `pnpm cca status` for a one-liner with event/session counts.

### Logs

| Service | Log file |
|---|---|
| Daemon  | `~/Library/Logs/cca/daemon.log` |
| Web UI  | `~/Library/Logs/cca/web.log` |

```bash
tail -f ~/Library/Logs/cca/daemon.log
```

### Ports

| Port  | Owner       | Purpose                                  |
|-------|-------------|------------------------------------------|
| 9939  | Daemon      | `/status`, `/hook` (CC pings), `/events` (SSE) |
| 3939  | Web UI      | Next.js app                              |
| 54322 | Postgres    | Supabase container                       |

### Manual restart

```bash
# Daemon
pkill -f "cca/ingester.*cli\.ts daemon"
nohup pnpm --filter @cca/ingester exec tsx src/cli.ts daemon \
  >> ~/Library/Logs/cca/daemon.log 2>&1 &
disown

# Web
pkill -f "next dev .*-p 3939"
nohup pnpm --filter @cca/web dev \
  >> ~/Library/Logs/cca/web.log 2>&1 &
disown
```

## Recovery: when things stop ingesting

Symptom: `/status` returns `lastEventAt: null` for an extended period, or `pnpm cca status` shows a stale event count.

1. **Is Docker running?** `docker info > /dev/null 2>&1 && echo OK || open -a Docker`. Docker Desktop usually auto-resumes the Supabase container in a few seconds.
2. **Is Postgres reachable?** `pg_isready -h localhost -p 54322` (or any quick `psql -c "select 1"`).
3. **Is the daemon healthy?** If Postgres came back after the daemon started, the daemon's connection pool may be holding bad sockets. Restart it (see above).
4. **Did anything fall through the cracks?** Run `pnpm backfill`. The daemon and the backfiller share byte-offset cursors in `_ingest_cursors`, so the backfill picks up exactly where the live tailer left off. Expect "0 events" if the tailer caught up on its own.

## CLI

```bash
pnpm cca status              # event/session/active counts
pnpm cca sessions --limit 10 # recent sessions with status dot, duration, cost
pnpm cca replay <session>    # full timeline (turns + tool calls)
pnpm cca search "query"      # FTS with ts_headline-highlighted snippets
pnpm cca stats --since 30d   # top models / projects / tools (aggregate)
pnpm cca tail                # live SSE stream from the daemon
pnpm cca open                # open the web UI in your default browser
```

## Web UI

`http://localhost:3939` — five views with a global time picker in the nav:

- `/` — **Cost command center**: KPI strip (today/window/cache hit/top model/active), stacked-area spend by model, rule-based briefing card, top-cost sessions, cost distribution P50/P95/P99, cache hit trend, hour×day-of-week heatmap.
- `/sessions` — paginated sessions list with project/model filters and recent/cost sort toggle.
- `/session/<uuid>` — outcomes summary (cost, tools, files touched, cost split by model, first prompts) above a collapsible replay; `?raw=1` shows unredacted content, `?replay=1` expands the timeline.
- `/search?q=...` — full-text search with project/model/role chip filters, cost dot per result, and pagination.
- `/stats` — **Behavior**: tool error rate trend, prompt→response latency P50/P95, subagent depth histogram, token velocity, cache hit by model.

The header shows a live-activity indicator driven by the daemon's SSE stream (`http://localhost:9939/events`).

## Tests

```bash
pnpm test       # 54 tests across core / parsers / db / ingester / cli
pnpm typecheck
```

Tests hit the real `claude_code_test` database, which Drizzle's `db:push` keeps in sync with `packages/db/src/schema/`. Test files are serialized via `fileParallelism: false` in `vitest.config.ts` — several writer tests share DB tables and `TRUNCATE` each other's state if run concurrently.

## Notes on the drizzle-kit workaround

`packages/db/src/schema/index.ts` re-exports sibling schema files using `.ts` extensions rather than `.js`. This works around drizzle-kit 0.30's CJS bundler, which resolves `.js` literally and fails to find the source file. `packages/db/tsconfig.json` enables `allowImportingTsExtensions` + `noEmit` to keep `tsc` happy. `@cca/db` is consumed from source by downstream packages (no build step), so emission isn't needed anyway.

## Known deferred issues

See `STATUS.md` for the running list. The two that travel with the project are:

- **` ` in JSONL string values** — already stripped in `packages/parsers/src/jsonl.ts`, but if a brand-new event type sneaks one in elsewhere, ingest will throw on the offending file.
- **Lossy project-path encoding** in CC's flat directory format — the daemon prefers the verbatim `events.cwd` for display; never round-trip through the encoded folder name.

## Pointers

- Spec: `docs/superpowers/specs/2026-04-19-claude-code-analytics-design.md`
- Plans: `docs/superpowers/plans/2026-04-19-cca-{foundation,live-capture-and-cli,web-ui}.md`
- Per-plan completion notes: `STATUS.md`
