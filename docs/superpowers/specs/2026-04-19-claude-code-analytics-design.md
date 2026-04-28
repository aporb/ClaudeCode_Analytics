# Claude Code Analytics (`cca`) — Design Spec

- **Date:** 2026-04-19
- **Status:** Approved, ready for implementation plan
- **Author:** aporb + Claude (brainstorming session)
- **Working directory:** `<repo-root>`

---

## 1. Goal

Capture **every event** from every Claude Code session on this machine, persist it to Postgres, and expose it through a local web UI and CLI for four use cases:

1. **Debug / replay sessions** — step-by-step reconstruction of any past session.
2. **Analytics & trends** — tokens, cost, tool usage, cache hit rate, error rate over time.
3. **Full-text search** — find any past prompt, response, or tool output across all projects.
4. **Artifact extraction** — mine past sessions for reusable prompts, plans, and solutions.

The system is **localhost-only, single-user, read-only** with respect to Claude Code itself (it never writes into `~/.claude/`). It reuses the Postgres instance already running in the user's existing Supabase container.

---

## 2. Data Inventory (what's on disk today)

Measured on 2026-04-19 on this machine:

| Source | Path | Size | File count | Notes |
|---|---|---|---|---|
| Session transcripts | `~/.claude/projects/**/*.jsonl` | 2.4 GB | 3,184 top-level + 2,821 subagent | Full fidelity: messages, tool calls, hooks, snapshots |
| Prompt history | `~/.claude/history.jsonl` | 4.5 MB | 1 | Every typed prompt with project path + timestamp |
| Per-session TODOs | `~/.claude/todos/*.json` | small | many | Often `[]` |
| File backups | `~/.claude/file-history/` | 84 MB | many | Pre-edit file snapshots |
| Shell snapshots | `~/.claude/shell-snapshots/` | 43 MB | many | zsh state per bash invocation |

**Total:** ~2.5 GB raw. Projected Postgres footprint with indexes, tsvector, pg_trgm, and JSONB payloads: **~4–6 GB**.

### 2.1 JSONL event shape (verified samples)

Top-level keys present on most lines:

```
parentUuid, isSidechain, promptId, agentId, type, message, uuid,
timestamp, userType, entrypoint, cwd, sessionId, version, gitBranch,
slug, requestId
```

Assistant messages include a rich `usage` object:

```json
"usage": {
  "input_tokens": 3,
  "cache_creation_input_tokens": 3699,
  "cache_read_input_tokens": 8147,
  "cache_creation": { "ephemeral_5m_input_tokens": 3699, "ephemeral_1h_input_tokens": 0 },
  "output_tokens": 197,
  "server_tool_use": { "web_search_requests": 0, "web_fetch_requests": 0 }
}
```

`model` is set per-message (e.g. `"claude-sonnet-4-6"`). This is enough to compute cost by joining against a seeded `model_pricing` table.

Event types observed: `user`, `assistant`, `progress` (hook events), `file-history-snapshot`. Subtypes within `message.content` include `text`, `tool_use`, `tool_result`, `thinking`.

Subagent transcripts live at `.../projects/<flat>/<sessionId>/subagents/agent-*.jsonl` — they share `sessionId` but have their own `agentId` and must be ingested recursively.

---

## 3. Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│  ~/.claude/                                                       │
│    projects/**/*.jsonl  (incl. subagents/**)                      │
│    history.jsonl                                                  │
│    todos/*.json                                                   │
│    file-history/**                                                │
│    shell-snapshots/*.sh                                           │
└─────────────┬────────────────────────────────────────────────────┘
              │ fsevents (chokidar) — append-detect per file
              ▼
    ┌─────────────────────┐     ┌─────────────────────┐
    │  Ingester daemon    │◄────│  Claude Code hooks  │
    │  (Node, launchd)    │ HTTP│  liveness pings on  │
    │  • backfiller       │:9939│  SessionStart /     │
    │  • live tailer      │     │  SessionEnd / Stop  │
    │  • parser+upserter  │     └─────────────────────┘
    │  • cost calculator  │
    └──────────┬──────────┘
               │ Drizzle ORM
               ▼
    ┌─────────────────────────────────────────────────┐
    │  Postgres 17 (existing container, port 54322)   │
    │  database: claude_code                           │
    │  • events (raw, JSONB, append-only)             │
    │  • sessions, messages, tool_calls (derived)     │
    │  • usage_daily (materialized view)              │
    │  • file_snapshots, shell_snapshots, todos,      │
    │    prompts_history, model_pricing               │
    └────────┬────────────────────────────────────────┘
             │
     ┌───────┴──────────────────────┐
     ▼                              ▼
 ┌─────────────────┐         ┌─────────────────┐
 │  Web UI         │         │  CLI (cca)      │
 │  Next.js 16     │         │  commander.js   │
 │  localhost:3939 │         │                 │
 │  • sessions     │         │  sessions ls    │
 │  • replay       │         │  replay <id>    │
 │  • search       │         │  search <q>     │
 │  • analytics    │         │  stats          │
 │  • live tail    │         │  tail --live    │
 └─────────────────┘         └─────────────────┘
```

**Design principle:** raw events are the source of truth; derived tables are caches rebuildable from events. Ingest is idempotent keyed on event `uuid`.

---

## 4. Repo Layout

pnpm monorepo so ingester, CLI, and web share TypeScript types and DB schema.

```
ClaudeCode_Analytics/
├─ apps/
│  ├─ ingester/       # long-running daemon (backfiller + tailer + hook HTTP)
│  ├─ web/            # Next.js 16 App Router review UI
│  └─ cli/            # `cca` binary
├─ packages/
│  ├─ db/             # Drizzle schema, migrations, typed queries
│  ├─ parsers/        # JSONL, history, todos, shell, file-history parsers
│  └─ core/           # shared types, cost calc, redaction rules, path utils
├─ infra/
│  ├─ docker/
│  │  └─ create-db.sql             # CREATE DATABASE claude_code;
│  └─ launchd/
│     └─ com.aporb.cca.ingester.plist
├─ docs/
│  └─ superpowers/specs/           # this file lives here
├─ pnpm-workspace.yaml
├─ package.json
└─ tsconfig.base.json
```

---

## 5. Data Model

### 5.1 Core: `events` (append-only source of truth)

Every JSONL line — from transcripts, hooks, and file-history events — is inserted here verbatim.

```sql
CREATE TABLE events (
  uuid            UUID PRIMARY KEY,              -- from JSONL
  session_id      TEXT NOT NULL,
  parent_uuid     UUID,                           -- DAG edge
  type            TEXT NOT NULL,                  -- user | assistant | progress | file-history-snapshot | hook
  subtype         TEXT,                           -- text | tool_use | tool_result | thinking | hook_progress
  timestamp       TIMESTAMPTZ NOT NULL,
  cwd             TEXT,
  project_path    TEXT,                           -- normalized cwd
  git_branch      TEXT,
  cc_version      TEXT,
  entrypoint      TEXT,
  is_sidechain    BOOLEAN DEFAULT FALSE,          -- subagent marker
  agent_id        TEXT,
  request_id      TEXT,
  payload         JSONB NOT NULL,                 -- full original line
  source_file     TEXT NOT NULL,                  -- which .jsonl
  ingested_at     TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX events_session_ts_idx  ON events (session_id, timestamp);
CREATE INDEX events_project_ts_idx  ON events (project_path, timestamp DESC);
CREATE INDEX events_type_idx        ON events (type, subtype);
CREATE INDEX events_payload_gin     ON events USING GIN (payload jsonb_path_ops);
```

### 5.2 Derived tables

```sql
CREATE TABLE sessions (
  session_id              TEXT PRIMARY KEY,
  project_path            TEXT,
  started_at              TIMESTAMPTZ,
  ended_at                TIMESTAMPTZ,
  duration_sec            INTEGER,
  message_count           INTEGER,
  tool_call_count         INTEGER,
  subagent_count          INTEGER,
  git_branch              TEXT,
  cc_version              TEXT,
  models_used             TEXT[],
  total_input_tokens      BIGINT,
  total_output_tokens     BIGINT,
  total_cache_creation    BIGINT,
  total_cache_read        BIGINT,
  estimated_cost_usd      NUMERIC(10,4),
  first_user_prompt       TEXT,          -- preview for session list
  status                  TEXT            -- active | ended
);

CREATE TABLE messages (
  uuid                    UUID PRIMARY KEY REFERENCES events(uuid),
  session_id              TEXT NOT NULL,
  role                    TEXT NOT NULL,    -- user | assistant
  timestamp               TIMESTAMPTZ NOT NULL,
  model                   TEXT,
  text_content            TEXT,             -- flattened text (for FTS + previews)
  text_tsv                TSVECTOR,
  input_tokens            INTEGER,
  output_tokens           INTEGER,
  cache_creation_tokens   INTEGER,
  cache_read_tokens       INTEGER,
  is_sidechain            BOOLEAN
);
CREATE INDEX messages_tsv_idx      ON messages USING GIN (text_tsv);
CREATE INDEX messages_trgm_idx     ON messages USING GIN (text_content gin_trgm_ops);
CREATE INDEX messages_session_idx  ON messages (session_id, timestamp);

CREATE TABLE tool_calls (
  uuid                    UUID PRIMARY KEY REFERENCES events(uuid),
  session_id              TEXT NOT NULL,
  timestamp               TIMESTAMPTZ NOT NULL,
  tool_name               TEXT NOT NULL,    -- Read | Edit | Bash | Grep | Task | Skill | ...
  input                   JSONB,
  result                  JSONB,
  result_uuid             UUID,
  duration_ms             INTEGER,          -- derived from tool_use → tool_result timestamp delta
  is_error                BOOLEAN,
  parent_message_uuid     UUID
);
CREATE INDEX tool_calls_name_idx    ON tool_calls (tool_name, timestamp DESC);
CREATE INDEX tool_calls_session_idx ON tool_calls (session_id, timestamp);
```

### 5.3 Ancillary streams

```sql
CREATE TABLE prompts_history (         -- ~/.claude/history.jsonl
  id              BIGSERIAL PRIMARY KEY,
  project_path    TEXT,
  display         TEXT,
  pasted_contents JSONB,
  typed_at        TIMESTAMPTZ,
  UNIQUE (typed_at, display, project_path)   -- idempotency
);

CREATE TABLE todos (
  session_id      TEXT,
  agent_id        TEXT,
  snapshot_at     TIMESTAMPTZ,
  todos           JSONB,
  PRIMARY KEY (session_id, agent_id, snapshot_at)
);

CREATE TABLE file_snapshots (
  session_id      TEXT,
  file_path       TEXT,
  version         INTEGER,
  snapshot_at     TIMESTAMPTZ,
  content         TEXT,                -- BYTEA fallback if binary
  sha256          TEXT,
  PRIMARY KEY (session_id, file_path, version)
);

CREATE TABLE shell_snapshots (
  id              TEXT PRIMARY KEY,    -- filename-derived
  captured_at     TIMESTAMPTZ,
  content         TEXT
);
```

### 5.4 Pricing & rollups

```sql
CREATE TABLE model_pricing (
  model                       TEXT PRIMARY KEY,
  input_per_mtok              NUMERIC(10,4),
  output_per_mtok             NUMERIC(10,4),
  cache_write_5m_per_mtok     NUMERIC(10,4),
  cache_write_1h_per_mtok     NUMERIC(10,4),
  cache_read_per_mtok         NUMERIC(10,4),
  effective_from              TIMESTAMPTZ
);

-- Internal cursor for the tailer (survives daemon restart)
CREATE TABLE _ingest_cursors (
  source_file     TEXT PRIMARY KEY,
  byte_offset     BIGINT NOT NULL,
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE MATERIALIZED VIEW usage_daily AS
SELECT
  date_trunc('day', timestamp) AS day,
  project_path,
  model,
  COUNT(*)                                AS message_count,
  SUM(input_tokens)                       AS input_tokens,
  SUM(output_tokens)                      AS output_tokens,
  SUM(cache_creation_tokens)              AS cache_creation,
  SUM(cache_read_tokens)                  AS cache_read
FROM messages m
JOIN sessions s USING (session_id)
WHERE role = 'assistant'
GROUP BY 1, 2, 3;

-- Refreshed by ingester at end of each ingest batch
```

---

## 6. Components

### 6.1 Ingester daemon (`apps/ingester`)

Long-running Node 24 process managed by launchd. Three responsibilities:

**Backfiller** — runs on first boot and via `cca backfill`:
- Enumerate `~/.claude/projects/**/*.jsonl` (including `**/subagents/**/*.jsonl`), `~/.claude/history.jsonl`, `~/.claude/todos/*.json`, `~/.claude/file-history/**`, `~/.claude/shell-snapshots/*.sh`.
- Stream each JSONL file line-by-line, batch 1,000 events, insert with `ON CONFLICT (uuid) DO NOTHING`.
- Upsert derived rows (`sessions`, `messages`, `tool_calls`) in the same transaction.
- Write a cursor row to `_ingest_cursors` with the final byte offset per file.

**Live tailer** — chokidar 4 watches the paths above:
- On `add` or `change`, opens the file, seeks to cursor offset, reads to EOF, parses new lines, upserts.
- Persists updated offset back to `_ingest_cursors`.
- Handles file rotation, deletion, and creation of new project directories.

**Hook relay** — HTTP server on `localhost:9939`:
- `POST /hook` — receives `{sessionId, event, timestamp, projectPath}` from Claude Code hooks.
- Updates `sessions.status` (`active` on `SessionStart`, `ended` on `SessionEnd`/`Stop`).
- Broadcasts via Server-Sent Events to the web UI for the live-activity indicator.
- Hook handlers themselves are minimal bash scripts using `curl --max-time 1 --silent` so they never block Claude Code.

### 6.2 CLI (`apps/cli` → binary `cca`)

```
cca status                   # daemon running? last event? DB connection OK?
cca backfill [--since 30d]   # manual backfill trigger
cca sessions [--project x] [--since 7d] [--model claude-sonnet-4-6]
cca replay <session-id> [--follow] [--raw]
cca search "term" [--since 7d] [--project x] [--tool Read]
cca stats                    # tokens / cost / tools this week, top projects
cca tail --live              # stream events as they happen (SSE consumer)
cca open <session-id>        # xdg-open web UI at that session
```

### 6.3 Web UI (`apps/web` → Next.js 16 on `localhost:3939`)

Four views:

1. **Sessions list** — paginated, filterable by project/date/model/duration/cost. Each row: first-prompt preview, tool-call count, total cost, git branch, status badge (live / ended).
2. **Session detail / replay** — timeline of every event. Renders:
   - User prompts (with `command-name` / `command-args` parsed out for slash commands)
   - Assistant messages with collapsible `thinking` blocks
   - Tool calls with input/output inspector (Read → file preview, Edit → diff, Bash → stdout/stderr, Task → nested subagent tree, Skill → invocation trace)
   - Hook events inline
   - Subagents rendered as expandable nested timelines
   - Redaction applied on render with a "show raw" toggle
3. **Search** — Postgres FTS (`text_tsv`) + pg_trgm fuzzy. Filters: project, date range, tool, model. Results link into Session detail at the matching event.
4. **Analytics dashboard** — charts (Recharts):
   - Tokens / cost over time (stacked by model)
   - Top tools by call count and by error rate
   - Cost by project
   - Cache-hit rate (cache_read / (cache_read + cache_creation))
   - Model mix pie
   - Weekly activity heatmap

Live activity indicator driven by SSE stream from the ingester's hook relay.

---

## 7. Ingest flow details

### 7.1 Backfill (one-time, ~10–30 min estimated)

- Parallelism: `p-limit(8)` for file reads; single DB writer.
- Subagent files detected by path match `**/subagents/agent-*.jsonl` — `is_sidechain=true`, `agent_id` from filename.
- Progress bar in CLI (`cli-progress` or `clack`).

### 7.2 Live (<1 s lag target)

- macOS fsevents fires on each append. Chokidar's `awaitWriteFinish` disabled (we want every append).
- Cursor offset persistence after each batch — crash-safe.
- If the daemon dies and restarts, it resumes from cursors; no duplicates because of `uuid` conflict.

### 7.3 Hook registration

Added to `~/.claude/settings.json` (user-global):

```json
{
  "hooks": {
    "SessionStart": [{ "hooks": [{ "type": "command", "command": "~/.claude/hooks/cca-ping.sh SessionStart" }] }],
    "SessionEnd":   [{ "hooks": [{ "type": "command", "command": "~/.claude/hooks/cca-ping.sh SessionEnd"   }] }],
    "Stop":         [{ "hooks": [{ "type": "command", "command": "~/.claude/hooks/cca-ping.sh Stop"         }] }]
  }
}
```

The `cca-ping.sh` script is ~5 lines of bash — curl to `localhost:9939/hook` with 1-second timeout. Co-exists with the existing `PreToolUse` rtk hook.

---

## 8. Tech stack

| Layer | Choice | Rationale |
|---|---|---|
| Runtime | Node 24 LTS | Current default; fsevents mature; matches Vercel/Next.js baseline |
| Language | TypeScript everywhere | Shared types across ingester / CLI / web |
| DB | Existing Supabase Postgres 17 in Docker, new DB `claude_code` | Reuses running container; total isolation via separate database |
| ORM | Drizzle | Type-safe, migration-first, lightweight |
| File watching | chokidar 4 | Mature fsevents wrapper |
| CLI framework | Commander + picocolors + clack | Standard Node CLI toolkit |
| Web framework | Next.js 16 (App Router) + Tailwind + shadcn/ui | Matches user's existing frontend stack; Server Components for data-heavy timeline |
| Charts | Recharts | Simple enough for V1 analytics |
| Daemon manager | launchd (`~/Library/LaunchAgents/com.aporb.cca.ingester.plist`) | Native macOS, survives reboot, auto-restart |
| Search | Postgres `tsvector` + `pg_trgm` | No new service; plenty for this scale |
| Monorepo | pnpm workspaces | Matches `mission-control-saas` repo conventions |
| Package manager | pnpm | Consistent with user's other projects |

---

## 9. Redaction

Single module at `packages/core/redaction.ts`. Regex rules applied **only at the web UI render layer** (DB stays lossless). Patterns:

- Anthropic API keys: `sk-ant-[A-Za-z0-9\-_]{20,}`
- OpenAI API keys: `sk-[A-Za-z0-9]{20,}`
- AWS access keys: `AKIA[0-9A-Z]{16}`
- GitHub PATs: `ghp_[A-Za-z0-9]{30,}` / `github_pat_[A-Za-z0-9_]{20,}`
- Generic Bearer tokens in headers: `Bearer\s+[A-Za-z0-9\-_\.]{20,}`
- JWTs: `eyJ[A-Za-z0-9_\-]+\.eyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+`

Each match is replaced with `[REDACTED:<kind>]`. A "show raw" toggle in the UI reveals originals (single-user, localhost — acceptable).

---

## 10. Out of scope (YAGNI)

- Multi-user / auth — localhost single-user.
- Cloud sync / remote access.
- Writing back into `~/.claude/` — strictly read-only.
- AI-assisted review ("summarize this session", "cluster similar sessions") — easy to add later; not V1.
- Exporting redacted sessions for sharing — add on demand.
- Alerting / notifications (budget thresholds, error spikes) — future.
- Cross-machine sync — future.

---

## 11. Key design decisions (rationale)

1. **Tailer as primary capture, hooks as liveness-only.** JSONL files contain everything Claude Code does. Duplicating capture in hooks adds no data and risks slowing CC. Hooks exist solely to tag `sessions.status` in real time.
2. **Event-sourced core + derived tables.** Lossless replay AND fast analytics without picking one. Derived tables are rebuildable from `events` via a `cca rebuild-derived` command.
3. **New database, not new schema.** Separate DB in the same container gives total isolation from `mission-control-saas` with zero new Docker containers.
4. **Postgres FTS, not Elasticsearch.** 2.5 GB of text with `tsvector` + `pg_trgm` is well within Postgres's comfort zone.
5. **Node/TS everywhere, not a Rust/Python split.** Unified types and tooling outweigh marginal perf wins; fsevents + readline handle this volume easily.
6. **launchd, not pm2 or Docker.** Native macOS, zero extra dependencies, auto-restart on reboot.
7. **Redact on display, not ingest.** Ingest-time redaction is lossy and irreversible on false positives; localhost single-user DB means raw storage is acceptable.

---

## 12. Implementation milestones (rough — detailed plan next)

1. **M1 — DB foundation**: create `claude_code` database, write Drizzle schema + migrations, seed `model_pricing`.
2. **M2 — Parsers**: pure functions for JSONL / history / todos / file-history / shell-snapshots. Unit-tested.
3. **M3 — Backfiller**: one-shot CLI that ingests all existing files. Measured and tuned.
4. **M4 — Live tailer**: chokidar-based daemon. Cursor persistence. launchd plist.
5. **M5 — CLI**: `cca status / sessions / replay / search / stats / tail`.
6. **M6 — Hook relay + ping script**: HTTP server + bash helper; wire into `~/.claude/settings.json`.
7. **M7 — Web UI V1**: sessions list + session detail + search.
8. **M8 — Web UI V2**: analytics dashboard + live activity indicator.

Each milestone is independently testable and deliverable.

---

## 13. Success criteria

- Every event in every new Claude Code session on this machine appears in Postgres within 1 second.
- Full backfill of existing 2.5 GB completes in one run, idempotent on re-run.
- Sessions list loads in <500 ms for the full history.
- Full-text search returns results in <200 ms for any term.
- The ingester daemon survives reboot and can be stopped/restarted without data loss.
- Cost estimates in `sessions.estimated_cost_usd` agree with `ccusage` output to within 1 %.
