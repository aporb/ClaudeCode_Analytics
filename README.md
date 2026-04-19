# Claude Code Analytics (cca)

Logs every Claude Code session on this machine to Postgres and lets you review it locally.

See `docs/superpowers/specs/2026-04-19-claude-code-analytics-design.md` for the design.

## Setup

```bash
pnpm install
# Create the database in your existing Supabase container
psql postgresql://postgres:postgres@localhost:54322/postgres -f infra/docker/create-db.sql
pnpm db:migrate
pnpm db:seed
pnpm backfill
```
