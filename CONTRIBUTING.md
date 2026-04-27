# Contributing

Thanks for taking a look. This is a personal-tooling project that other people might find useful — patches and issues are welcome, but please don't expect SLA-grade responsiveness.

## Setup

```bash
pnpm install
cp .env.example .env.local                            # defaults work as-is
psql "$CCA_DATABASE_URL" -f infra/docker/create-db.sql  # creates claude_code + claude_code_test
pnpm db:migrate
pnpm db:seed
pnpm backfill                                         # one-shot import from $CLAUDE_HOME
```

You'll need:
- macOS (the launchd / `~/.claude` paths are macOS-specific).
- Node 22+ and pnpm 9+ (`corepack enable && corepack prepare pnpm@latest --activate`).
- Docker Desktop running with a Postgres 17 container exposing `localhost:54322`.

## Dev loop

| Want to… | Run |
|---|---|
| Run all tests | `pnpm test` (root, vitest) |
| Run web tests | `pnpm --filter @cca/web test` |
| Typecheck | `pnpm typecheck` |
| Format | `pnpm format` |
| Run the daemon manually | `pnpm --filter @cca/ingester exec tsx src/cli.ts daemon` |
| Run the web UI | `pnpm web` (port `3939`) |
| Run the CLI | `pnpm cca <subcommand>` |
| Sync a remote (multi-host) | `pnpm cca sync --force --host <name>` |

Tests share the `claude_code_test` database; `vitest.config.ts` has `fileParallelism: false` because several tests `TRUNCATE` shared writer tables.

## Conventions

- TypeScript strict mode + `exactOptionalPropertyTypes`. Don't pass explicit `undefined` for optional fields; either omit or coalesce.
- Drizzle schema lives in `packages/db/src/schema/` and re-exports through `index.ts`. Hand-authored SQL supplements (for things drizzle-kit can't express, like materialized views or function-based unique indexes) live next to the generated migrations in `packages/db/drizzle/` and are applied via the allowlist in `packages/db/src/migrate.ts`.
- Web tests are co-located (`apps/web/.../foo.test.ts`); ingester/CLI tests live in `apps/<pkg>/tests/`.
- `host` defaults to `'local'` only at the orchestrator boundary (`backfillAll`); writer functions take it as a required arg so callers can't silently bury cross-host data under one label.

## What's where

```
apps/
├── cli/          pnpm cca <verb>: status, sessions, replay, search, stats, sync, ...
├── ingester/     daemon (chokidar tailer) + backfill orchestrator + sync runner
└── web/          Next.js 16 dashboard at :3939

packages/
├── core/         path utilities, shared types
├── db/           Drizzle schema + migrations + seed
└── parsers/      pure parsers for ~/.claude JSONL/JSON files

infra/
├── docker/       create-db.sql for first-time DB setup
├── hooks/        Claude Code hook helpers (cca-ping.sh)
└── launchd/      launchd plist templates (placeholder-substituted by install-*.sh)
```

## Filing issues

If you hit something broken: a one-line repro, the relevant log file from `~/Library/Logs/cca/`, and a `pnpm cca status` snapshot is usually plenty.
