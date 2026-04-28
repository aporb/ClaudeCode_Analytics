# AGENTS.md

Agent context file for ClaudeCode_Analytics (`cca`). Auto-loaded by Claude Code (via CLAUDE.md symlink), Codex, Copilot, Cursor, and any tool that reads AGENTS.md.

## What this is

Local-first observability for Claude Code sessions. Tails `~/.claude` (JSONL transcripts, hooks, history, todos, file snapshots), writes to Postgres on your machine, and ships a CLI + Next.js dashboard for usage review, session replay, transcript search, and cost tracking.

**Stack:** pnpm monorepo, TypeScript strict, Drizzle ORM, Vitest, Next.js 16, Biome.

## Commands

### Setup (first time)

```bash
pnpm install
cp .env.example .env.local                            # defaults work as-is
psql "$CCA_DATABASE_URL" -f infra/docker/create-db.sql  # creates claude_code + claude_code_test
pnpm db:migrate
pnpm db:seed
pnpm backfill                                         # one-shot import from ~/.claude
```

### Dev loop

| Action | Command |
|---|---|
| Run all tests | `pnpm test` |
| Test one package | `pnpm --filter @cca/<pkg> test` |
| Run single test | `pnpm --filter @cca/<pkg> vitest run -t "test name"` |
| Typecheck all | `pnpm typecheck` |
| Typecheck one package | `pnpm --filter @cca/<pkg> typecheck` |
| Lint all | `pnpm lint` |
| Format all | `pnpm format` |
| Run daemon | `pnpm --filter @cca/ingester exec tsx src/cli.ts daemon` |
| Run web UI | `pnpm web` (port 3939) |
| Run CLI | `pnpm cca <subcommand>` |

### Database

| Action | Command |
|---|---|
| Generate migration | `pnpm db:generate` |
| Run migrations | `pnpm db:migrate` |
| Seed pricing data | `pnpm db:seed` |
| Backfill from `~/.claude` | `pnpm backfill` |

## Project structure

```
apps/
├── cli/          @cca/cli — terminal client (status, sessions, replay, search, stats, sync, tail)
├── ingester/     @cca/ingester — chokidar tailer daemon + backfill orchestrator + SSH sync runner
└── web/          @cca/web — Next.js 16 dashboard on :3939

packages/
├── core/         @cca/core — path utilities, shared types
├── db/           @cca/db — Drizzle schema, migrations, seed
└── parsers/      @cca/parsers — pure parsers for ~/.claude JSONL/JSON files

infra/
├── docker/       create-db.sql + docker-compose.yml for standalone Postgres 17
├── hooks/        Claude Code hook helpers
└── launchd/      macOS launchd plist templates (parameterized)

docs/
└── superpowers/  specs/ and plans/ — design docs and implementation history
```

## Conventions

- **TypeScript strict** + `exactOptionalPropertyTypes`. Don't pass explicit `undefined` for optional fields — omit or coalesce.
- **Drizzle ORM** for all database operations. Schema in `packages/db/src/schema/`, re-exported through `index.ts`. Hand-authored SQL supplements (materialized views, function-based indexes) live in `packages/db/drizzle/`.
- **Biome** for linting and formatting (not ESLint/Prettier). Single quotes, no semicolons, 2-space indent.
- **Vitest** for testing. Tests are co-located in `apps/web/` (`*.test.ts`) or in `apps/<pkg>/tests/` for ingester/CLI.
- **`fileParallelism: false`** in vitest config — several tests `TRUNCATE` shared writer tables. Don't change this without understanding the test isolation model.
- **`host` param** is required at writer boundaries, defaults to `'local'` only at the orchestrator level (`backfillAll`). Don't silently hardcode it.
- **Package names** use `@cca/` scope (e.g. `@cca/db`, `@cca/web`). Always use `pnpm --filter @cca/<pkg>` to target a specific package.

## Boundaries

- ✅ **Always:** Run `pnpm lint && pnpm test` before committing
- ✅ **Always:** Keep changes scoped to one package when possible
- ⚠️ **Ask first:** Adding new dependencies, modifying Drizzle schema, changing vitest config
- 🚫 **Never:** Commit `.env.local`, edit `node_modules`, modify `pnpm-lock.yaml` without running `pnpm install`
- 🚫 **Never:** Use raw SQL when Drizzle can express it — use the ORM

## Gotchas

- **macOS-specific.** The daemon watches `~/.claude`, and auto-start uses launchd + zshrc snippets. Linux adaptation would need systemd equivalents.
- **Postgres 17 required.** Uses features not available in earlier versions.
- **Test DB is shared.** `claude_code_test` is used across all test files. The `fileParallelism: false` setting prevents race conditions — don't enable parallelism without refactoring the TRUNCATE pattern.
- **Path flattening is lossy.** Claude Code flattens project paths (e.g. `/home/user/projects/my-app` → `-home-user-projects-my-app`). The `events.cwd` column preserves real paths; prefer it over reconstructed paths for display.
- **Migrations are allowlisted.** `packages/db/src/migrate.ts` controls which SQL files run. New hand-authored SQL must be added to the allowlist.
