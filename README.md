# Claude Code Analytics (`cca`)

Local-first observability for [Claude Code](https://claude.com/claude-code) sessions. Tails `~/.claude` (JSONL transcripts, hooks, history, todos, file snapshots), writes everything to a Postgres database on your machine, and ships a CLI plus a Next.js dashboard so you can review usage, replay sessions, search transcripts, and track cost.

Three components, all on `localhost`:

- **Ingester** (`apps/ingester`) — `chokidar` tailer daemon on `:9939` watching `$CLAUDE_HOME`, plus a backfill CLI for the historical state and a `cca sync` runner that pulls remote machines via SSH+rsync (multi-host).
- **CLI** (`apps/cli`) — `pnpm cca {status,sessions,replay,search,stats,sync,tail,open}` for terminal queries.
- **Web** (`apps/web`) — Next.js 16 App Router on `:3939`. Cost command center on `/`, sessions list, session detail/replay, full-text search, behavior trends, per-host breakdown.

See `STATUS.md` for what shipped when and `docs/superpowers/specs/` for the design docs.

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
- Postgres 17 reachable on `localhost:54322`. Two ways to get one:
  - **Standalone (fresh clone):** `docker compose -f infra/docker/docker-compose.yml up -d` brings up a minimal Postgres 17 container named `cca-postgres`.
  - **Existing Supabase container:** Use any Supabase Postgres 17 already running on `:54322`. The `claude_code` and `claude_code_test` databases will live alongside whatever else is there.
- `.env.local` at the repo root. The defaults in `.env.example` work as-is for
  the standard Supabase docker setup — just copy and run:

  ```bash
  cp .env.example .env.local
  ```

  `CLAUDE_HOME` is optional; if unset, the ingester defaults to `$HOME/.claude`
  at runtime. Override only if your data lives elsewhere.

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

# Install the Claude Code hook so live sessions ping the daemon.
# This MERGES a `hooks` block into ~/.claude/settings.json — back it up first
# if you've customized that file. The script preserves any existing hooks
# (e.g. rtk) by keying on hook command paths.
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

The multi-host sync uses a separate **launchd plist** (every 3h; see [Multi-host sync](#multi-host-sync)) instead of a `~/.zshrc` snippet — sync needs to fire on a fixed cadence whether or not a terminal is open. The same FDA caveat applies; manual `pnpm cca sync` from a terminal is the documented fallback.

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

## Multi-host sync

Pull Claude Code transcripts from other machines you SSH into and ingest them under the same dashboard. Each row is tagged with a `host` column; existing local data is labelled `local`. The web UI grows a host filter chip and a `/hosts` page; the rest of the views just gain a host badge.

Sync is launchd-only — the existing `~/.zshrc` auto-start is unchanged.

### Configuration: `cca.remotes.json`

Create `cca.remotes.json` at the repo root (gitignored):

```json
[
  { "host": "hostinger", "ssh": "ssh_hostinger", "claudeHome": "~/.claude" },
  { "host": "picoclaw",  "ssh": "ssh_picoclaw",  "claudeHome": "~/.claude" }
]
```

| Field | Purpose |
|---|---|
| `host` | Label stamped on every ingested row. Must match `^[a-z0-9][a-z0-9_-]*$` and cannot be `local` (reserved for the daemon). Unique across the registry. |
| `ssh` | SSH alias from `~/.ssh/config`. |
| `claudeHome` | Remote `~/.claude` path. Defaults to `~/.claude` if omitted (tilde expanded by `ssh` on the remote). |

Validation runs on every `cca sync`. A malformed file exits non-zero before any rsync — `host_sync_state` is never touched.

### CLI

```bash
pnpm cca sync                              # all due hosts (respects per-host backoff)
pnpm cca sync --force                      # skip the due check, sync everyone now
pnpm cca sync --host hostinger             # one host, still respects backoff
pnpm cca sync --force --host hostinger     # one host, run now
pnpm cca sync --reset-state hostinger      # delete the host's row in host_sync_state (data untouched)
```

First-time pull for a new remote:

```bash
# 1. Add the entry to cca.remotes.json
# 2. Pull now and watch it ingest
pnpm cca sync --force --host hostinger

# 3. Confirm rows landed
psql "$CCA_DATABASE_URL" -c "select host, count(*) from events group by host;"
```

### Scheduled cadence

The sync job runs every **3 hours** via launchd. Inside each invocation, every host has its own backoff:

- 3h is the floor.
- Each empty pull (rsync exit 0, 0 files transferred) bumps the next interval: 3h → 6h → 12h (capped).
- Any non-empty pull resets back to 3h and updates `last_had_data_at`.
- Errors (rsync non-zero) increment `consecutive_errors` but do **not** affect the empty-pull backoff.

State lives in the `host_sync_state` table; the launchd job always wakes at 3h and the runner decides per-host whether each is due.

### Installing the launchd plist

```bash
./scripts/install-sync.sh     # writes ~/Library/LaunchAgents/com.aporb.cca.sync.plist + scripts/run-sync.sh
./scripts/uninstall-sync.sh   # unloads, removes the plist + wrapper
```

Logs land at `~/Library/Logs/cca/sync.log` (one line per host per run).

**FDA caveat (same as the daemon).** macOS Full Disk Access can block launchd-spawned processes from reading `~/Documents/`. If the scheduled run silently does nothing, run `pnpm cca sync` from a terminal — the interactive shell inherits FDA and always works. Granting FDA to the launchd executor is the long-term fix.

### Removing a host

Removing a line from `cca.remotes.json` stops new pulls but leaves history queryable under the old label. To fully purge a host (deliberately manual — there is no one-button purge):

```bash
# 1. Remove the entry from cca.remotes.json
# 2. Drop the state row (no data deleted by this step)
pnpm cca sync --reset-state hostinger

# 3. Delete the host's data
psql "$CCA_DATABASE_URL" <<'SQL'
DELETE FROM events           WHERE host = 'hostinger';
DELETE FROM sessions         WHERE host = 'hostinger';
DELETE FROM messages         WHERE host = 'hostinger';
DELETE FROM tool_calls       WHERE host = 'hostinger';
DELETE FROM prompts_history  WHERE host = 'hostinger';
DELETE FROM file_snapshots   WHERE host = 'hostinger';
DELETE FROM shell_snapshots  WHERE host = 'hostinger';
DELETE FROM todos            WHERE host = 'hostinger';
SQL

# 4. Remove the local mirror dir
rm -rf .cca/remotes/hostinger
```

`--reset-state` is intentionally state-only — it never touches `events` rows or the mirror dir.

### Troubleshooting

- **Rsync failed.** Tail `~/Library/Logs/cca/sync.log`. Verify the SSH alias works in isolation: `ssh ssh_hostinger 'ls ~/.claude'`. Common causes are an unreachable host, a missing remote `~/.claude`, and a full local disk under `.cca/remotes/`.
- **`consecutive_errors >= 3` banner in the UI.** At the 3h cadence that's at least nine hours of failed pulls — past the "transient" window. Run `pnpm cca sync --force --host <name>` from a terminal, read the log, and fix whatever's broken (SSH config, disk, credentials). The banner clears on the next successful pull.
- **Scheduled run does nothing but manual works.** FDA — see the caveat above.

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
pnpm test                          # ~113 tests across core / parsers / db / ingester / cli
pnpm --filter @cca/web test        # ~66 web tests (queries + RTL component tests)
pnpm typecheck                     # all 6 workspaces
pnpm --filter @cca/web build       # next build with the new /hosts route
```

The root `vitest` run uses `**/tests/**/*.test.ts` globs and so excludes the `apps/web` tests, which are co-located next to source (e.g. `apps/web/lib/queries/cost.test.ts`). Run them via the `--filter @cca/web` command above.

Tests hit the real `claude_code_test` database, which `drizzle-kit push` keeps in sync with `packages/db/src/schema/`. Test files are serialized via `fileParallelism: false` in `vitest.config.ts` — several writer tests share DB tables and `TRUNCATE` each other's state if run concurrently.

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
