# Claude Code Analytics (`cca`)

Logs every Claude Code session on this machine to Postgres and lets you review it locally.

See `docs/superpowers/specs/2026-04-19-claude-code-analytics-design.md` for the full design and `docs/superpowers/plans/2026-04-19-cca-foundation.md` for the Plan 1 implementation plan.

## Prerequisites

- Node 22+ and pnpm 9+ (`corepack enable && corepack prepare pnpm@latest --activate`).
- A running Postgres 17 (this repo uses the existing `supabase_db_mission-control-saas` container on `localhost:54322`).
- `.env.local` at the repo root with:

  ```bash
  CCA_DATABASE_URL=postgresql://postgres:postgres@localhost:54322/claude_code
  CCA_DATABASE_URL_TEST=postgresql://postgres:postgres@localhost:54322/claude_code_test
  CLAUDE_HOME=/Users/amynporb/.claude
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

# Start the daemon to capture new sessions live (optional)
pnpm --filter @cca/ingester exec tsx src/cli.ts daemon
```

## Running tests

```bash
pnpm test          # 39 tests across core / parsers / db / ingester
pnpm typecheck
```

Tests hit the real `claude_code_test` database, which Task 7's `drizzle-kit push` keeps in sync with `packages/db/src/schema/`. Test files are serialized via `fileParallelism: false` in `vitest.config.ts` — several writer tests share DB tables and `TRUNCATE` each other's state if run concurrently.

## Notes on the drizzle-kit workaround

`packages/db/src/schema/index.ts` re-exports sibling schema files using `.ts` extensions rather than `.js`. This is a workaround for drizzle-kit 0.30's CJS bundler, which resolves `.js` literally and fails to find the source file. To keep `tsc` happy, `packages/db/tsconfig.json` enables `allowImportingTsExtensions` + `noEmit`. `@cca/db` is consumed from source by downstream packages (no build step), so emission isn't needed anyway.

## Current status

See `STATUS.md` for the latest backfill snapshot and known deferred issues.

## Web UI

```bash
pnpm web       # dev server at http://localhost:3939
```

Four views:
- `/` — sessions list with filters (project/since/model) and pagination
- `/session/<uuid>` — event timeline with tool-call inspector; `?raw=1` shows unredacted content
- `/search?q=...` — full-text search with highlighted snippets
- `/stats` — tokens over time, top tools, cost by project, activity heatmap

The header shows a live-activity indicator driven by the daemon's SSE stream (`http://localhost:9939/events`).
