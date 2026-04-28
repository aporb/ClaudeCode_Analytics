# CCA Foundation Implementation Plan (Plan 1 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the ingestion foundation for Claude Code Analytics: create the `claude_code` Postgres database, write pure parsers for every on-disk source, and deliver a one-shot backfill CLI that ingests the user's existing 2.5 GB of Claude Code history. End state: every historical session queryable via SQL.

**Architecture:** pnpm TypeScript monorepo. Five workspaces: `packages/core` (types, cost, redaction, paths), `packages/parsers` (pure parsing functions), `packages/db` (Drizzle schema + client), `apps/ingester` (backfill + writer). Tests with Vitest. DB is a new database `claude_code` inside the user's existing Supabase Postgres 17 container on `localhost:54322`.

**Tech Stack:** Node 24, TypeScript 5.7+, pnpm 9, Drizzle ORM 0.36+, postgres (driver) 3.4+, chokidar 4 (Plan 2), Commander 12, Vitest 2, Biome 1.9, clack prompts, cli-progress, p-limit 6.

---

## File Structure

```
ClaudeCode_Analytics/
├─ apps/
│  └─ ingester/
│     ├─ src/
│     │  ├─ writer/
│     │  │  ├─ events.ts          # batch insert to events table
│     │  │  ├─ derive.ts          # derive sessions/messages/tool_calls
│     │  │  └─ transaction.ts     # transactional batch wrapper
│     │  ├─ backfill/
│     │  │  ├─ enumerate.ts       # walk ~/.claude for all source files
│     │  │  ├─ orchestrator.ts    # main backfill loop with progress
│     │  │  └─ ancillary.ts       # ingest history/todos/file-history/shell
│     │  ├─ cli.ts                # commander entry: backfill, rebuild-derived
│     │  └─ index.ts              # exports
│     ├─ tests/
│     │  └─ integration.test.ts
│     ├─ package.json
│     └─ tsconfig.json
├─ packages/
│  ├─ core/
│  │  ├─ src/
│  │  │  ├─ types.ts              # Event, Session, Message, ToolCall types
│  │  │  ├─ paths.ts              # CC flat-path ↔ real-path normalization
│  │  │  ├─ cost.ts               # cost calculator
│  │  │  ├─ redaction.ts          # regex redaction rules
│  │  │  └─ index.ts
│  │  ├─ tests/
│  │  │  ├─ paths.test.ts
│  │  │  ├─ cost.test.ts
│  │  │  └─ redaction.test.ts
│  │  ├─ package.json
│  │  └─ tsconfig.json
│  ├─ parsers/
│  │  ├─ src/
│  │  │  ├─ jsonl.ts              # streaming line reader
│  │  │  ├─ transcript.ts         # transcript JSONL → typed events
│  │  │  ├─ history.ts            # ~/.claude/history.jsonl
│  │  │  ├─ todos.ts              # ~/.claude/todos/*.json
│  │  │  ├─ fileHistory.ts        # ~/.claude/file-history/**
│  │  │  ├─ shellSnapshots.ts     # ~/.claude/shell-snapshots/*.sh
│  │  │  └─ index.ts
│  │  ├─ tests/
│  │  │  ├─ fixtures/             # committed sample data
│  │  │  ├─ transcript.test.ts
│  │  │  ├─ history.test.ts
│  │  │  ├─ todos.test.ts
│  │  │  ├─ fileHistory.test.ts
│  │  │  └─ shellSnapshots.test.ts
│  │  ├─ package.json
│  │  └─ tsconfig.json
│  └─ db/
│     ├─ src/
│     │  ├─ schema/
│     │  │  ├─ events.ts
│     │  │  ├─ sessions.ts
│     │  │  ├─ messages.ts
│     │  │  ├─ toolCalls.ts
│     │  │  ├─ ancillary.ts       # prompts_history, todos, file_snapshots, shell_snapshots
│     │  │  ├─ pricing.ts
│     │  │  ├─ cursors.ts
│     │  │  └─ index.ts
│     │  ├─ client.ts
│     │  ├─ seed.ts               # model_pricing seed
│     │  └─ index.ts
│     ├─ drizzle/                 # generated migrations
│     ├─ drizzle.config.ts
│     ├─ package.json
│     └─ tsconfig.json
├─ infra/
│  └─ docker/
│     └─ create-db.sql
├─ docs/
│  └─ superpowers/
│     ├─ specs/
│     └─ plans/
├─ .env.example
├─ .env.local                     # gitignored
├─ .gitignore
├─ biome.json
├─ package.json                   # root
├─ pnpm-workspace.yaml
├─ tsconfig.base.json
├─ vitest.config.ts
└─ README.md
```

---

## Task 1: Monorepo scaffold

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `biome.json`, `vitest.config.ts`, `.gitignore`, `.env.example`, `.env.local`, `README.md`

- [ ] **Step 1: Create root `package.json`**

```json
{
  "name": "cca",
  "private": true,
  "version": "0.1.0",
  "packageManager": "pnpm@9.15.0",
  "engines": { "node": ">=22" },
  "scripts": {
    "build": "pnpm -r build",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "biome check .",
    "format": "biome format --write .",
    "typecheck": "pnpm -r typecheck",
    "db:generate": "pnpm --filter @cca/db generate",
    "db:migrate": "pnpm --filter @cca/db migrate",
    "db:seed": "pnpm --filter @cca/db seed",
    "backfill": "pnpm --filter @cca/ingester backfill"
  },
  "devDependencies": {
    "@biomejs/biome": "1.9.4",
    "@types/node": "22.10.0",
    "tsx": "4.19.2",
    "typescript": "5.7.2",
    "vitest": "2.1.8"
  }
}
```

- [ ] **Step 2: Create `pnpm-workspace.yaml`**

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

- [ ] **Step 3: Create `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2023"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "resolveJsonModule": true,
    "isolatedModules": true
  }
}
```

- [ ] **Step 4: Create `biome.json`**

```json
{
  "$schema": "https://biomejs.dev/schemas/1.9.4/schema.json",
  "files": { "ignore": ["**/dist/**", "**/drizzle/**", "**/node_modules/**"] },
  "formatter": { "enabled": true, "indentStyle": "space", "indentWidth": 2, "lineWidth": 100 },
  "linter": { "enabled": true, "rules": { "recommended": true } },
  "javascript": { "formatter": { "quoteStyle": "single", "semicolons": "asNeeded" } }
}
```

- [ ] **Step 5: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['**/tests/**/*.test.ts'],
    environment: 'node',
    pool: 'threads',
    globals: false,
  },
})
```

- [ ] **Step 6: Create `.gitignore`**

```
node_modules/
dist/
*.log
.env
.env.local
.DS_Store
coverage/
.vitest/
.remember/
```

- [ ] **Step 7: Create `.env.example`**

```
# Existing Supabase container on port 54322. Create `claude_code` DB inside it.
CCA_DATABASE_URL=postgresql://postgres:postgres@localhost:54322/claude_code
CCA_DATABASE_URL_TEST=postgresql://postgres:postgres@localhost:54322/claude_code_test
CLAUDE_HOME=~/.claude
```

- [ ] **Step 8: Create `.env.local` (gitignored, real values)**

```
CCA_DATABASE_URL=postgresql://postgres:postgres@localhost:54322/claude_code
CCA_DATABASE_URL_TEST=postgresql://postgres:postgres@localhost:54322/claude_code_test
CLAUDE_HOME=~/.claude
```

- [ ] **Step 9: Create minimal `README.md`**

```markdown
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
```

- [ ] **Step 10: Install root deps + verify**

Run:
```bash
pnpm install
pnpm typecheck  # nothing to check yet, but confirms pnpm works
```
Expected: `pnpm install` completes, no errors. Lockfile created.

- [ ] **Step 11: Commit**

```bash
git add .
git commit -m "chore: monorepo scaffold (pnpm workspaces, biome, vitest, tsconfig base)"
```

---

## Task 2: Package skeletons

**Files:**
- Create: `packages/core/{package.json,tsconfig.json,src/index.ts}`
- Create: `packages/parsers/{package.json,tsconfig.json,src/index.ts}`
- Create: `packages/db/{package.json,tsconfig.json,src/index.ts}`
- Create: `apps/ingester/{package.json,tsconfig.json,src/index.ts}`

- [ ] **Step 1: Create `packages/core/package.json`**

```json
{
  "name": "@cca/core",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "scripts": { "typecheck": "tsc --noEmit", "build": "tsc" }
}
```

- [ ] **Step 2: Create `packages/core/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src" },
  "include": ["src/**/*", "tests/**/*"]
}
```

- [ ] **Step 3: Create `packages/core/src/index.ts`**

```ts
export * from './types.js'
export * from './paths.js'
export * from './cost.js'
export * from './redaction.js'
```

- [ ] **Step 4: Create `packages/parsers/package.json`**

```json
{
  "name": "@cca/parsers",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "scripts": { "typecheck": "tsc --noEmit", "build": "tsc" },
  "dependencies": { "@cca/core": "workspace:*" }
}
```

- [ ] **Step 5: Create `packages/parsers/tsconfig.json`** (same as core)

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src" },
  "include": ["src/**/*", "tests/**/*"]
}
```

- [ ] **Step 6: Create `packages/parsers/src/index.ts`**

```ts
export * from './jsonl.js'
export * from './transcript.js'
export * from './history.js'
export * from './todos.js'
export * from './fileHistory.js'
export * from './shellSnapshots.js'
```

- [ ] **Step 7: Create `packages/db/package.json`**

```json
{
  "name": "@cca/db",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./schema": "./src/schema/index.ts",
    "./client": "./src/client.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "build": "tsc",
    "generate": "drizzle-kit generate",
    "migrate": "tsx src/migrate.ts",
    "seed": "tsx src/seed.ts"
  },
  "dependencies": {
    "@cca/core": "workspace:*",
    "drizzle-orm": "0.36.4",
    "postgres": "3.4.5"
  },
  "devDependencies": { "drizzle-kit": "0.30.0" }
}
```

- [ ] **Step 8: Create `packages/db/tsconfig.json`** (same pattern)

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src" },
  "include": ["src/**/*"]
}
```

- [ ] **Step 9: Create `packages/db/src/index.ts`**

```ts
export * from './schema/index.js'
export { getDb, closeDb } from './client.js'
```

- [ ] **Step 10: Create `apps/ingester/package.json`**

```json
{
  "name": "@cca/ingester",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "typecheck": "tsc --noEmit",
    "backfill": "tsx src/cli.ts backfill",
    "rebuild-derived": "tsx src/cli.ts rebuild-derived"
  },
  "dependencies": {
    "@cca/core": "workspace:*",
    "@cca/db": "workspace:*",
    "@cca/parsers": "workspace:*",
    "@clack/prompts": "0.8.2",
    "cli-progress": "3.12.0",
    "commander": "12.1.0",
    "p-limit": "6.1.0",
    "picocolors": "1.1.1"
  },
  "devDependencies": { "@types/cli-progress": "3.11.6" }
}
```

- [ ] **Step 11: Create `apps/ingester/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src" },
  "include": ["src/**/*", "tests/**/*"]
}
```

- [ ] **Step 12: Create placeholder `apps/ingester/src/index.ts`**

```ts
export {}
```

- [ ] **Step 13: Install**

```bash
pnpm install
pnpm typecheck
```
Expected: both succeed. `drizzle-kit` and runtime deps appear in `node_modules`.

- [ ] **Step 14: Commit**

```bash
git add .
git commit -m "chore: add package skeletons for core, parsers, db, ingester"
```

---

## Task 3: Create `claude_code` database

**Files:**
- Create: `infra/docker/create-db.sql`

- [ ] **Step 1: Write `infra/docker/create-db.sql`**

```sql
-- Run against the existing Supabase Postgres container:
-- psql postgresql://postgres:postgres@localhost:54322/postgres -f infra/docker/create-db.sql

SELECT 'CREATE DATABASE claude_code'
 WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'claude_code')\gexec

SELECT 'CREATE DATABASE claude_code_test'
 WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'claude_code_test')\gexec

\c claude_code
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

\c claude_code_test
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
```

- [ ] **Step 2: Execute the script**

Run:
```bash
psql postgresql://postgres:postgres@localhost:54322/postgres -f infra/docker/create-db.sql
```
Expected output includes `CREATE DATABASE` and `CREATE EXTENSION` lines. Re-running must not error (idempotent).

- [ ] **Step 3: Verify the DB exists**

Run:
```bash
psql postgresql://postgres:postgres@localhost:54322/claude_code -c "SELECT 1"
```
Expected: returns `1` row with value `1`.

- [ ] **Step 4: Commit**

```bash
git add infra/
git commit -m "feat(db): create claude_code and claude_code_test databases with pg_trgm"
```

---

## Task 4: DB client module

**Files:**
- Create: `packages/db/src/client.ts`

- [ ] **Step 1: Write `packages/db/src/client.ts`**

```ts
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema/index.js'

type Db = ReturnType<typeof drizzle<typeof schema>>

let _client: postgres.Sql | null = null
let _db: Db | null = null

export function getDb(url?: string): Db {
  if (_db) return _db
  const connectionString = url ?? process.env.CCA_DATABASE_URL
  if (!connectionString) {
    throw new Error('CCA_DATABASE_URL is not set')
  }
  _client = postgres(connectionString, { max: 10, prepare: false })
  _db = drizzle(_client, { schema })
  return _db
}

export async function closeDb(): Promise<void> {
  if (_client) {
    await _client.end()
    _client = null
    _db = null
  }
}
```

- [ ] **Step 2: Create empty `packages/db/src/schema/index.ts` so the import resolves**

```ts
// Schema tables will be exported from here.
export {}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @cca/db typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/db/
git commit -m "feat(db): add postgres-js client module with lazy connection"
```

---

## Task 5: Drizzle config

**Files:**
- Create: `packages/db/drizzle.config.ts`

- [ ] **Step 1: Write `packages/db/drizzle.config.ts`**

```ts
import 'dotenv/config'
import { defineConfig } from 'drizzle-kit'

const url = process.env.CCA_DATABASE_URL
if (!url) throw new Error('CCA_DATABASE_URL is not set (check .env.local)')

export default defineConfig({
  schema: './src/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url },
  strict: true,
  verbose: true,
})
```

- [ ] **Step 2: Add `dotenv` to db devDependencies**

Edit `packages/db/package.json` — add to `devDependencies`:
```json
"dotenv": "16.4.5"
```

- [ ] **Step 3: Add a root-level symlink for env loading**

Drizzle-kit runs in the package dir. We need the config to find `.env.local` at the repo root.

Edit `packages/db/drizzle.config.ts` — replace the `import 'dotenv/config'` line with:

```ts
import { config } from 'dotenv'
import { resolve } from 'node:path'
config({ path: resolve(process.cwd(), '../../.env.local') })
```

- [ ] **Step 4: Install and verify**

```bash
pnpm install
pnpm --filter @cca/db exec drizzle-kit --help
```
Expected: drizzle-kit prints usage.

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat(db): drizzle-kit config with dotenv loader"
```

---

## Task 6: Schema — events table (TDD via integration test)

**Files:**
- Create: `packages/db/src/schema/events.ts`
- Create: `packages/db/src/schema/index.ts` (update)
- Create: `packages/db/tests/schema.test.ts`

- [ ] **Step 1: Write the failing test** at `packages/db/tests/schema.test.ts`

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import postgres from 'postgres'
import { config } from 'dotenv'
import { resolve } from 'node:path'
config({ path: resolve(__dirname, '../../../.env.local') })

const TEST_URL = process.env.CCA_DATABASE_URL_TEST
if (!TEST_URL) throw new Error('CCA_DATABASE_URL_TEST required')

describe('schema: events', () => {
  let sql: postgres.Sql
  beforeAll(() => { sql = postgres(TEST_URL!, { max: 2 }) })
  afterAll(async () => { await sql.end() })

  it('has events table with expected columns', async () => {
    const cols = await sql<Array<{ column_name: string; data_type: string }>>`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'events'
      ORDER BY ordinal_position
    `
    const names = cols.map((c) => c.column_name)
    expect(names).toEqual(
      expect.arrayContaining([
        'uuid', 'session_id', 'parent_uuid', 'type', 'subtype',
        'timestamp', 'cwd', 'project_path', 'git_branch', 'cc_version',
        'entrypoint', 'is_sidechain', 'agent_id', 'request_id',
        'payload', 'source_file', 'ingested_at',
      ]),
    )
  })
})
```

- [ ] **Step 2: Add `dotenv` to db devDeps if not already there, then run test**

```bash
pnpm --filter @cca/db add -D dotenv
pnpm test -- schema
```
Expected: FAIL — `relation "events" does not exist` (table not created yet).

- [ ] **Step 3: Write `packages/db/src/schema/events.ts`**

```ts
import { boolean, index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export const events = pgTable(
  'events',
  {
    uuid: uuid('uuid').primaryKey(),
    sessionId: text('session_id').notNull(),
    parentUuid: uuid('parent_uuid'),
    type: text('type').notNull(),
    subtype: text('subtype'),
    timestamp: timestamp('timestamp', { withTimezone: true }).notNull(),
    cwd: text('cwd'),
    projectPath: text('project_path'),
    gitBranch: text('git_branch'),
    ccVersion: text('cc_version'),
    entrypoint: text('entrypoint'),
    isSidechain: boolean('is_sidechain').default(false).notNull(),
    agentId: text('agent_id'),
    requestId: text('request_id'),
    payload: jsonb('payload').notNull(),
    sourceFile: text('source_file').notNull(),
    ingestedAt: timestamp('ingested_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('events_session_ts_idx').on(t.sessionId, t.timestamp),
    index('events_project_ts_idx').on(t.projectPath, t.timestamp.desc()),
    index('events_type_idx').on(t.type, t.subtype),
  ],
)
```

- [ ] **Step 4: Export from `packages/db/src/schema/index.ts`**

```ts
export * from './events.js'
```

- [ ] **Step 5: Generate and apply migration against TEST DB**

```bash
# Generate
pnpm --filter @cca/db generate
# Apply to test DB manually
CCA_DATABASE_URL="$CCA_DATABASE_URL_TEST" pnpm --filter @cca/db exec drizzle-kit push
```
Expected: `drizzle/0000_*.sql` created; push succeeds.

- [ ] **Step 6: Run the test**

```bash
pnpm test -- schema
```
Expected: PASS.

- [ ] **Step 7: Add the GIN index on `payload` (drizzle-kit doesn't support custom index types cleanly, so use a raw SQL migration)**

Create `packages/db/drizzle/0001_events_gin.sql`:

```sql
CREATE INDEX IF NOT EXISTS events_payload_gin ON events USING GIN (payload jsonb_path_ops);
```

- [ ] **Step 8: Commit**

```bash
git add packages/db/ .
git commit -m "feat(db): add events schema with indexes"
```

---

## Task 7: Schema — sessions, messages, tool_calls

**Files:**
- Create: `packages/db/src/schema/sessions.ts`
- Create: `packages/db/src/schema/messages.ts`
- Create: `packages/db/src/schema/toolCalls.ts`
- Modify: `packages/db/src/schema/index.ts`
- Modify: `packages/db/tests/schema.test.ts` (add assertions)

- [ ] **Step 1: Extend the test** with `packages/db/tests/schema.test.ts` new cases:

Append inside the `describe` block:

```ts
it('has sessions table', async () => {
  const cols = await sql<Array<{ column_name: string }>>`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'sessions' ORDER BY ordinal_position`
  expect(cols.map((c) => c.column_name)).toEqual(
    expect.arrayContaining([
      'session_id', 'project_path', 'started_at', 'ended_at', 'duration_sec',
      'message_count', 'tool_call_count', 'subagent_count', 'git_branch',
      'cc_version', 'models_used', 'total_input_tokens', 'total_output_tokens',
      'total_cache_creation', 'total_cache_read', 'estimated_cost_usd',
      'first_user_prompt', 'status',
    ]),
  )
})

it('has messages table with tsvector column', async () => {
  const cols = await sql<Array<{ column_name: string; data_type: string }>>`
    SELECT column_name, data_type FROM information_schema.columns
    WHERE table_name = 'messages' ORDER BY ordinal_position`
  const byName = Object.fromEntries(cols.map((c) => [c.column_name, c.data_type]))
  expect(byName.text_tsv).toBe('tsvector')
  expect(byName.role).toBe('text')
})

it('has tool_calls table', async () => {
  const cols = await sql<Array<{ column_name: string }>>`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'tool_calls' ORDER BY ordinal_position`
  expect(cols.map((c) => c.column_name)).toEqual(
    expect.arrayContaining([
      'uuid', 'session_id', 'timestamp', 'tool_name', 'input', 'result',
      'result_uuid', 'duration_ms', 'is_error', 'parent_message_uuid',
    ]),
  )
})
```

- [ ] **Step 2: Run; expect failure**

```bash
pnpm test -- schema
```
Expected: three new tests FAIL (tables don't exist).

- [ ] **Step 3: Write `packages/db/src/schema/sessions.ts`**

```ts
import { bigint, integer, numeric, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

export const sessions = pgTable('sessions', {
  sessionId: text('session_id').primaryKey(),
  projectPath: text('project_path'),
  startedAt: timestamp('started_at', { withTimezone: true }),
  endedAt: timestamp('ended_at', { withTimezone: true }),
  durationSec: integer('duration_sec'),
  messageCount: integer('message_count'),
  toolCallCount: integer('tool_call_count'),
  subagentCount: integer('subagent_count'),
  gitBranch: text('git_branch'),
  ccVersion: text('cc_version'),
  modelsUsed: text('models_used').array(),
  totalInputTokens: bigint('total_input_tokens', { mode: 'number' }),
  totalOutputTokens: bigint('total_output_tokens', { mode: 'number' }),
  totalCacheCreation: bigint('total_cache_creation', { mode: 'number' }),
  totalCacheRead: bigint('total_cache_read', { mode: 'number' }),
  estimatedCostUsd: numeric('estimated_cost_usd', { precision: 10, scale: 4 }),
  firstUserPrompt: text('first_user_prompt'),
  status: text('status'),
})
```

- [ ] **Step 4: Write `packages/db/src/schema/messages.ts`**

```ts
import { sql } from 'drizzle-orm'
import { boolean, customType, index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { events } from './events.js'

const tsvector = customType<{ data: string }>({
  dataType() { return 'tsvector' },
})

export const messages = pgTable(
  'messages',
  {
    uuid: uuid('uuid')
      .primaryKey()
      .references(() => events.uuid, { onDelete: 'cascade' }),
    sessionId: text('session_id').notNull(),
    role: text('role').notNull(), // 'user' | 'assistant'
    timestamp: timestamp('timestamp', { withTimezone: true }).notNull(),
    model: text('model'),
    textContent: text('text_content'),
    textTsv: tsvector('text_tsv'),
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    cacheCreationTokens: integer('cache_creation_tokens'),
    cacheReadTokens: integer('cache_read_tokens'),
    isSidechain: boolean('is_sidechain').default(false).notNull(),
  },
  (t) => [index('messages_session_idx').on(t.sessionId, t.timestamp)],
)
```

- [ ] **Step 5: Write `packages/db/src/schema/toolCalls.ts`**

```ts
import { boolean, index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { events } from './events.js'

export const toolCalls = pgTable(
  'tool_calls',
  {
    uuid: uuid('uuid')
      .primaryKey()
      .references(() => events.uuid, { onDelete: 'cascade' }),
    sessionId: text('session_id').notNull(),
    timestamp: timestamp('timestamp', { withTimezone: true }).notNull(),
    toolName: text('tool_name').notNull(),
    input: jsonb('input'),
    result: jsonb('result'),
    resultUuid: uuid('result_uuid'),
    durationMs: integer('duration_ms'),
    isError: boolean('is_error'),
    parentMessageUuid: uuid('parent_message_uuid'),
  },
  (t) => [
    index('tool_calls_name_idx').on(t.toolName, t.timestamp.desc()),
    index('tool_calls_session_idx').on(t.sessionId, t.timestamp),
  ],
)
```

- [ ] **Step 6: Update `packages/db/src/schema/index.ts`**

```ts
export * from './events.js'
export * from './sessions.js'
export * from './messages.js'
export * from './toolCalls.js'
```

- [ ] **Step 7: Generate migration + push to test DB**

```bash
pnpm --filter @cca/db generate
CCA_DATABASE_URL="$CCA_DATABASE_URL_TEST" pnpm --filter @cca/db exec drizzle-kit push
```

- [ ] **Step 8: Add raw-SQL migration for FTS/trgm indexes on messages**

Create `packages/db/drizzle/0003_messages_indexes.sql`:

```sql
CREATE INDEX IF NOT EXISTS messages_tsv_idx  ON messages USING GIN (text_tsv);
CREATE INDEX IF NOT EXISTS messages_trgm_idx ON messages USING GIN (text_content gin_trgm_ops);
```

Apply it:
```bash
psql "$CCA_DATABASE_URL_TEST" -f packages/db/drizzle/0003_messages_indexes.sql
```

- [ ] **Step 9: Run tests — expect all PASS**

```bash
pnpm test -- schema
```
Expected: 4 tests pass.

- [ ] **Step 10: Commit**

```bash
git add packages/db/
git commit -m "feat(db): add sessions, messages (with tsvector), tool_calls schemas"
```

---

## Task 8: Schema — ancillary tables, pricing, cursors

**Files:**
- Create: `packages/db/src/schema/ancillary.ts`
- Create: `packages/db/src/schema/pricing.ts`
- Create: `packages/db/src/schema/cursors.ts`
- Modify: `packages/db/src/schema/index.ts`
- Modify: `packages/db/tests/schema.test.ts`

- [ ] **Step 1: Add test assertions for the remaining tables**

Append to `packages/db/tests/schema.test.ts`:

```ts
it('has ancillary tables', async () => {
  const tables = await sql<Array<{ table_name: string }>>`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' ORDER BY table_name`
  const names = tables.map((t) => t.table_name)
  expect(names).toEqual(
    expect.arrayContaining([
      'prompts_history', 'todos', 'file_snapshots', 'shell_snapshots',
      'model_pricing', '_ingest_cursors',
    ]),
  )
})
```

- [ ] **Step 2: Run — expect failure**

```bash
pnpm test -- schema
```

- [ ] **Step 3: Write `packages/db/src/schema/ancillary.ts`**

```ts
import { bigserial, integer, jsonb, pgTable, primaryKey, text, timestamp, unique } from 'drizzle-orm/pg-core'

export const promptsHistory = pgTable(
  'prompts_history',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    projectPath: text('project_path'),
    display: text('display'),
    pastedContents: jsonb('pasted_contents'),
    typedAt: timestamp('typed_at', { withTimezone: true }),
  },
  (t) => [unique('prompts_history_dedupe').on(t.typedAt, t.display, t.projectPath)],
)

export const todos = pgTable(
  'todos',
  {
    sessionId: text('session_id').notNull(),
    agentId: text('agent_id').notNull(),
    snapshotAt: timestamp('snapshot_at', { withTimezone: true }).notNull(),
    todos: jsonb('todos').notNull(),
  },
  (t) => [primaryKey({ columns: [t.sessionId, t.agentId, t.snapshotAt] })],
)

export const fileSnapshots = pgTable(
  'file_snapshots',
  {
    sessionId: text('session_id').notNull(),
    filePath: text('file_path').notNull(),
    version: integer('version').notNull(),
    snapshotAt: timestamp('snapshot_at', { withTimezone: true }),
    content: text('content'),
    sha256: text('sha256'),
  },
  (t) => [primaryKey({ columns: [t.sessionId, t.filePath, t.version] })],
)

export const shellSnapshots = pgTable('shell_snapshots', {
  id: text('id').primaryKey(),
  capturedAt: timestamp('captured_at', { withTimezone: true }),
  content: text('content'),
})
```

- [ ] **Step 4: Write `packages/db/src/schema/pricing.ts`**

```ts
import { numeric, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

export const modelPricing = pgTable('model_pricing', {
  model: text('model').primaryKey(),
  inputPerMtok: numeric('input_per_mtok', { precision: 10, scale: 4 }),
  outputPerMtok: numeric('output_per_mtok', { precision: 10, scale: 4 }),
  cacheWrite5mPerMtok: numeric('cache_write_5m_per_mtok', { precision: 10, scale: 4 }),
  cacheWrite1hPerMtok: numeric('cache_write_1h_per_mtok', { precision: 10, scale: 4 }),
  cacheReadPerMtok: numeric('cache_read_per_mtok', { precision: 10, scale: 4 }),
  effectiveFrom: timestamp('effective_from', { withTimezone: true }),
})
```

- [ ] **Step 5: Write `packages/db/src/schema/cursors.ts`**

```ts
import { bigint, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

export const ingestCursors = pgTable('_ingest_cursors', {
  sourceFile: text('source_file').primaryKey(),
  byteOffset: bigint('byte_offset', { mode: 'number' }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})
```

- [ ] **Step 6: Update `packages/db/src/schema/index.ts`**

```ts
export * from './events.js'
export * from './sessions.js'
export * from './messages.js'
export * from './toolCalls.js'
export * from './ancillary.ts'
export * from './pricing.js'
export * from './cursors.js'
```

(Fix: use `.js` extension for ancillary — replace `.ts` with `.js` in the line above.)

- [ ] **Step 7: Generate + push + test**

```bash
pnpm --filter @cca/db generate
CCA_DATABASE_URL="$CCA_DATABASE_URL_TEST" pnpm --filter @cca/db exec drizzle-kit push
pnpm test -- schema
```
Expected: all tests pass.

- [ ] **Step 8: Commit**

```bash
git add packages/db/
git commit -m "feat(db): add ancillary tables, model_pricing, _ingest_cursors"
```

---

## Task 9: Migrate runner + apply to production DB

**Files:**
- Create: `packages/db/src/migrate.ts`

- [ ] **Step 1: Write `packages/db/src/migrate.ts`**

```ts
import { config } from 'dotenv'
import { resolve } from 'node:path'
config({ path: resolve(process.cwd(), '../../.env.local') })

import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'

async function main() {
  const url = process.env.CCA_DATABASE_URL
  if (!url) throw new Error('CCA_DATABASE_URL not set')
  const sql = postgres(url, { max: 1 })
  const db = drizzle(sql)
  await migrate(db, { migrationsFolder: './drizzle' })
  // Also apply the raw-SQL migrations that drizzle-kit can't express
  for (const f of ['0001_events_gin.sql', '0003_messages_indexes.sql']) {
    const path = resolve(__dirname, '..', 'drizzle', f)
    try {
      const fs = await import('node:fs/promises')
      const body = await fs.readFile(path, 'utf8')
      await sql.unsafe(body)
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
    }
  }
  await sql.end()
  console.log('migrations applied')
}

main().catch((e) => { console.error(e); process.exit(1) })
```

- [ ] **Step 2: Apply to real DB**

```bash
pnpm db:migrate
```
Expected: `migrations applied`. No errors.

- [ ] **Step 3: Verify tables present**

```bash
psql "$CCA_DATABASE_URL" -c "\dt"
```
Expected: lists `events`, `sessions`, `messages`, `tool_calls`, `prompts_history`, `todos`, `file_snapshots`, `shell_snapshots`, `model_pricing`, `_ingest_cursors`.

- [ ] **Step 4: Commit**

```bash
git add packages/db/
git commit -m "feat(db): add migrate runner that applies drizzle + raw SQL migrations"
```

---

## Task 10: Seed `model_pricing`

**Files:**
- Create: `packages/db/src/seed.ts`

- [ ] **Step 1: Write `packages/db/src/seed.ts`**

```ts
import { config } from 'dotenv'
import { resolve } from 'node:path'
config({ path: resolve(process.cwd(), '../../.env.local') })

import { getDb, closeDb } from './client.js'
import { modelPricing } from './schema/index.js'
import { sql } from 'drizzle-orm'

// Per Anthropic public pricing as of 2026-04 (USD per 1M tokens).
// Cache write prices: 5m ephemeral = 1.25x input; 1h ephemeral = 2x input.
// Update effective_from when you refresh these values.
const EFFECTIVE_FROM = new Date('2026-01-01T00:00:00Z')
const PRICES = [
  { model: 'claude-opus-4-7',   input: 15,  output: 75, write5m: 18.75, write1h: 30, read: 1.5 },
  { model: 'claude-opus-4-7[1m]', input: 15, output: 75, write5m: 18.75, write1h: 30, read: 1.5 },
  { model: 'claude-opus-4-6',   input: 15,  output: 75, write5m: 18.75, write1h: 30, read: 1.5 },
  { model: 'claude-opus-4-5',   input: 15,  output: 75, write5m: 18.75, write1h: 30, read: 1.5 },
  { model: 'claude-sonnet-4-6', input: 3,   output: 15, write5m: 3.75,  write1h: 6,  read: 0.3 },
  { model: 'claude-sonnet-4-5', input: 3,   output: 15, write5m: 3.75,  write1h: 6,  read: 0.3 },
  { model: 'claude-sonnet-4-0', input: 3,   output: 15, write5m: 3.75,  write1h: 6,  read: 0.3 },
  { model: 'claude-haiku-4-5',  input: 1,   output: 5,  write5m: 1.25,  write1h: 2,  read: 0.1 },
  { model: 'claude-haiku-4-5-20251001', input: 1, output: 5, write5m: 1.25, write1h: 2, read: 0.1 },
]

async function main() {
  const db = getDb()
  for (const p of PRICES) {
    await db
      .insert(modelPricing)
      .values({
        model: p.model,
        inputPerMtok: p.input.toString(),
        outputPerMtok: p.output.toString(),
        cacheWrite5mPerMtok: p.write5m.toString(),
        cacheWrite1hPerMtok: p.write1h.toString(),
        cacheReadPerMtok: p.read.toString(),
        effectiveFrom: EFFECTIVE_FROM,
      })
      .onConflictDoUpdate({
        target: modelPricing.model,
        set: {
          inputPerMtok: sql`excluded.input_per_mtok`,
          outputPerMtok: sql`excluded.output_per_mtok`,
          cacheWrite5mPerMtok: sql`excluded.cache_write_5m_per_mtok`,
          cacheWrite1hPerMtok: sql`excluded.cache_write_1h_per_mtok`,
          cacheReadPerMtok: sql`excluded.cache_read_per_mtok`,
          effectiveFrom: sql`excluded.effective_from`,
        },
      })
  }
  console.log(`seeded ${PRICES.length} model prices`)
  await closeDb()
}

main().catch((e) => { console.error(e); process.exit(1) })
```

- [ ] **Step 2: Run the seed**

```bash
pnpm db:seed
```
Expected: `seeded 9 model prices`.

- [ ] **Step 3: Verify**

```bash
psql "$CCA_DATABASE_URL" -c "SELECT model, input_per_mtok, output_per_mtok FROM model_pricing ORDER BY model"
```
Expected: 9 rows shown.

- [ ] **Step 4: Commit**

```bash
git add packages/db/
git commit -m "feat(db): seed model_pricing for Claude 4.x family"
```

---

## Task 11: Materialized view `usage_daily`

**Files:**
- Create: `packages/db/drizzle/0010_usage_daily_view.sql`
- Modify: `packages/db/src/migrate.ts` (add this file to the raw-SQL list)

- [ ] **Step 1: Write `packages/db/drizzle/0010_usage_daily_view.sql`**

```sql
CREATE MATERIALIZED VIEW IF NOT EXISTS usage_daily AS
SELECT
  date_trunc('day', m.timestamp)       AS day,
  s.project_path,
  m.model,
  COUNT(*)                             AS message_count,
  COALESCE(SUM(m.input_tokens), 0)     AS input_tokens,
  COALESCE(SUM(m.output_tokens), 0)    AS output_tokens,
  COALESCE(SUM(m.cache_creation_tokens), 0) AS cache_creation,
  COALESCE(SUM(m.cache_read_tokens), 0)     AS cache_read
FROM messages m
JOIN sessions s USING (session_id)
WHERE m.role = 'assistant'
GROUP BY 1, 2, 3;

CREATE UNIQUE INDEX IF NOT EXISTS usage_daily_unique ON usage_daily (day, project_path, model);
```

- [ ] **Step 2: Update `packages/db/src/migrate.ts`** — extend the raw-SQL list:

```ts
for (const f of ['0001_events_gin.sql', '0003_messages_indexes.sql', '0010_usage_daily_view.sql']) {
```

- [ ] **Step 3: Re-run migration**

```bash
pnpm db:migrate
```
Expected: `migrations applied`. Running again is a no-op (IF NOT EXISTS).

- [ ] **Step 4: Commit**

```bash
git add packages/db/
git commit -m "feat(db): add usage_daily materialized view"
```

---

## Task 12: Core — path normalization

**Files:**
- Create: `packages/core/src/paths.ts`
- Create: `packages/core/tests/paths.test.ts`

**Context:** Claude Code stores per-project transcripts under a flattened path — `/home/user/projects/foo` becomes `~/.claude/projects/-home-user-projects-foo/`. Double underscores in the path (`_projects`) become double dashes. We need to reverse this for the UI and for grouping by project.

- [ ] **Step 1: Write the failing test** at `packages/core/tests/paths.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { flatToRealPath, realToFlatPath, projectPathFromFile } from '../src/paths.js'

describe('paths', () => {
  it('converts flat CC path back to real filesystem path', () => {
    expect(flatToRealPath('-home-user-projects-ClaudeCode-Analytics'))
      .toBe('/home/user/projects/ClaudeCode_Analytics')
  })

  it('round-trips a real path', () => {
    const real = '/home/user/projects/foo-bar'
    expect(flatToRealPath(realToFlatPath(real))).toBe(real)
  })

  it('extracts project path from a full transcript file path', () => {
    const f = '/home/user/.claude/projects/-home-user-projects-ClaudeCode-Analytics/abc.jsonl'
    expect(projectPathFromFile(f)).toBe('/home/user/projects/ClaudeCode_Analytics')
  })

  it('extracts project path for subagent file', () => {
    const f = '/home/user/.claude/projects/-home-user-projects-foo/session123/subagents/agent-abc.jsonl'
    expect(projectPathFromFile(f)).toBe('/home/user/projects/foo')
  })
})
```

- [ ] **Step 2: Run — expect failure**

```bash
pnpm test -- paths
```
Expected: FAIL — module not found.

- [ ] **Step 3: Write `packages/core/src/paths.ts`**

```ts
// CC flattens real paths into its projects dir by mapping:
//   '/' -> '-'
//   actual '-' in the path is preserved
//   '_' in the path -> '-' (so '__' collapses to '--')
// There's no ambiguity for directory names that don't contain '-', which is ~all home dir paths.
// We reverse heuristically: consecutive '--' -> '_', single '-' (except leading) -> '/'.

export function flatToRealPath(flat: string): string {
  // Leading '-' marks absolute root.
  let s = flat
  if (s.startsWith('-')) s = s.slice(1)
  // Replace '--' with a placeholder, then single '-' with '/', then placeholder with '_'.
  const placeholder = '\u0000'
  s = s.replaceAll('--', placeholder).replaceAll('-', '/').replaceAll(placeholder, '_')
  return '/' + s
}

export function realToFlatPath(real: string): string {
  let s = real
  if (s.startsWith('/')) s = s.slice(1)
  s = s.replaceAll('_', '--').replaceAll('/', '-')
  return '-' + s
}

// Pull the project dir name out of a full transcript file path under ~/.claude/projects/
export function projectPathFromFile(file: string): string | null {
  const match = file.match(/\/\.claude\/projects\/([^\/]+)\//)
  if (!match) return null
  return flatToRealPath(match[1]!)
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
pnpm test -- paths
```
Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/core/
git commit -m "feat(core): project path flat/real conversion"
```

---

## Task 13: Core — cost calculator

**Files:**
- Create: `packages/core/src/cost.ts`
- Create: `packages/core/tests/cost.test.ts`

- [ ] **Step 1: Write the failing test** at `packages/core/tests/cost.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { calculateCost, type ModelPricing, type TokenUsage } from '../src/cost.js'

const sonnetPricing: ModelPricing = {
  inputPerMtok: 3,
  outputPerMtok: 15,
  cacheWrite5mPerMtok: 3.75,
  cacheWrite1hPerMtok: 6,
  cacheReadPerMtok: 0.3,
}

describe('cost', () => {
  it('computes cost for plain input+output', () => {
    const usage: TokenUsage = {
      inputTokens: 1_000_000,
      outputTokens: 500_000,
      cacheCreation5mTokens: 0,
      cacheCreation1hTokens: 0,
      cacheReadTokens: 0,
    }
    // 1M input * $3 + 0.5M output * $15 = 3 + 7.5 = 10.5
    expect(calculateCost(usage, sonnetPricing)).toBeCloseTo(10.5, 4)
  })

  it('includes cache writes and reads', () => {
    const usage: TokenUsage = {
      inputTokens: 0,
      outputTokens: 0,
      cacheCreation5mTokens: 1_000_000,
      cacheCreation1hTokens: 500_000,
      cacheReadTokens: 2_000_000,
    }
    // 1M * 3.75 + 0.5M * 6 + 2M * 0.3 = 3.75 + 3 + 0.6 = 7.35
    expect(calculateCost(usage, sonnetPricing)).toBeCloseTo(7.35, 4)
  })

  it('returns 0 for zero tokens', () => {
    expect(
      calculateCost(
        { inputTokens: 0, outputTokens: 0, cacheCreation5mTokens: 0, cacheCreation1hTokens: 0, cacheReadTokens: 0 },
        sonnetPricing,
      ),
    ).toBe(0)
  })
})
```

- [ ] **Step 2: Run — expect failure**

```bash
pnpm test -- cost
```

- [ ] **Step 3: Write `packages/core/src/cost.ts`**

```ts
export interface TokenUsage {
  inputTokens: number
  outputTokens: number
  cacheCreation5mTokens: number
  cacheCreation1hTokens: number
  cacheReadTokens: number
}

export interface ModelPricing {
  inputPerMtok: number
  outputPerMtok: number
  cacheWrite5mPerMtok: number
  cacheWrite1hPerMtok: number
  cacheReadPerMtok: number
}

export function calculateCost(usage: TokenUsage, pricing: ModelPricing): number {
  const MTOK = 1_000_000
  return (
    (usage.inputTokens / MTOK) * pricing.inputPerMtok +
    (usage.outputTokens / MTOK) * pricing.outputPerMtok +
    (usage.cacheCreation5mTokens / MTOK) * pricing.cacheWrite5mPerMtok +
    (usage.cacheCreation1hTokens / MTOK) * pricing.cacheWrite1hPerMtok +
    (usage.cacheReadTokens / MTOK) * pricing.cacheReadPerMtok
  )
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
pnpm test -- cost
```

- [ ] **Step 5: Commit**

```bash
git add packages/core/
git commit -m "feat(core): cost calculator for Claude token usage"
```

---

## Task 14: Core — redaction

**Files:**
- Create: `packages/core/src/redaction.ts`
- Create: `packages/core/tests/redaction.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { redact } from '../src/redaction.js'

describe('redaction', () => {
  it('redacts Anthropic API keys', () => {
    const input = 'My key is sk-ant-api03-abcDEF123_xyz456-ghi'
    expect(redact(input)).toContain('[REDACTED:anthropic]')
    expect(redact(input)).not.toContain('sk-ant-api03-abcDEF')
  })

  it('redacts AWS access key ids', () => {
    expect(redact('AKIAIOSFODNN7EXAMPLE')).toBe('[REDACTED:aws]')
  })

  it('redacts GitHub PATs', () => {
    expect(redact('token ghp_1234567890abcdefghij1234567890abcdefgh')).toContain('[REDACTED:github]')
  })

  it('redacts bearer tokens', () => {
    expect(redact('Authorization: Bearer eyJabc.eyJdef.ghi1234567890xxxxxxxxxx')).toContain('[REDACTED:jwt]')
  })

  it('leaves clean text alone', () => {
    const clean = 'just a regular sentence with numbers 12345'
    expect(redact(clean)).toBe(clean)
  })
})
```

- [ ] **Step 2: Run — expect failure**

```bash
pnpm test -- redaction
```

- [ ] **Step 3: Write `packages/core/src/redaction.ts`**

```ts
// Order matters: JWTs look like bearer tokens, so check JWT first.
const RULES: Array<{ kind: string; pattern: RegExp }> = [
  { kind: 'jwt',       pattern: /eyJ[A-Za-z0-9_\-]+\.eyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+/g },
  { kind: 'anthropic', pattern: /sk-ant-[A-Za-z0-9_\-]{20,}/g },
  { kind: 'openai',    pattern: /\bsk-[A-Za-z0-9]{32,}\b/g },
  { kind: 'aws',       pattern: /\bAKIA[0-9A-Z]{16}\b/g },
  { kind: 'github',    pattern: /\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}\b/g },
  { kind: 'github',    pattern: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g },
  { kind: 'bearer',    pattern: /Bearer\s+[A-Za-z0-9\-_\.]{20,}/g },
]

export function redact(text: string): string {
  let out = text
  for (const { kind, pattern } of RULES) {
    out = out.replaceAll(pattern, `[REDACTED:${kind}]`)
  }
  return out
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
pnpm test -- redaction
```

- [ ] **Step 5: Commit**

```bash
git add packages/core/
git commit -m "feat(core): regex redaction for common secret formats"
```

---

## Task 15: Core — shared types

**Files:**
- Create: `packages/core/src/types.ts`

- [ ] **Step 1: Write `packages/core/src/types.ts`**

```ts
// Top-level event discriminator
export type EventType =
  | 'user'
  | 'assistant'
  | 'progress'
  | 'file-history-snapshot'
  | 'summary'
  | 'hook'

// A single parsed JSONL line, typed.
export interface ParsedEvent {
  uuid: string
  sessionId: string
  parentUuid: string | null
  type: EventType
  subtype: string | null
  timestamp: Date
  cwd: string | null
  projectPath: string | null
  gitBranch: string | null
  ccVersion: string | null
  entrypoint: string | null
  isSidechain: boolean
  agentId: string | null
  requestId: string | null
  payload: unknown            // raw JSON line
  sourceFile: string
}

// Derived message row
export interface DerivedMessage {
  uuid: string
  sessionId: string
  role: 'user' | 'assistant'
  timestamp: Date
  model: string | null
  textContent: string | null
  inputTokens: number | null
  outputTokens: number | null
  cacheCreationTokens: number | null
  cacheReadTokens: number | null
  isSidechain: boolean
}

// Derived tool call (tool_use + tool_result joined)
export interface DerivedToolCall {
  uuid: string                // = tool_use event uuid
  sessionId: string
  timestamp: Date
  toolName: string
  input: unknown
  result: unknown | null
  resultUuid: string | null
  durationMs: number | null
  isError: boolean | null
  parentMessageUuid: string | null
}

// Rolled-up session
export interface DerivedSession {
  sessionId: string
  projectPath: string | null
  startedAt: Date | null
  endedAt: Date | null
  durationSec: number | null
  messageCount: number
  toolCallCount: number
  subagentCount: number
  gitBranch: string | null
  ccVersion: string | null
  modelsUsed: string[]
  totalInputTokens: number
  totalOutputTokens: number
  totalCacheCreation: number
  totalCacheRead: number
  estimatedCostUsd: number | null
  firstUserPrompt: string | null
  status: 'active' | 'ended' | null
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @cca/core typecheck
```

- [ ] **Step 3: Commit**

```bash
git add packages/core/
git commit -m "feat(core): shared event and derived-row types"
```

---

## Task 16: Parsers — JSONL streaming reader

**Files:**
- Create: `packages/parsers/src/jsonl.ts`
- Create: `packages/parsers/tests/jsonl.test.ts`
- Create: `packages/parsers/tests/fixtures/sample.jsonl`

- [ ] **Step 1: Create fixture `packages/parsers/tests/fixtures/sample.jsonl`** — 3 valid lines + 1 malformed:

```
{"uuid":"11111111-1111-1111-1111-111111111111","timestamp":"2026-03-24T04:48:24.639Z","type":"user","sessionId":"s1"}
{"uuid":"22222222-2222-2222-2222-222222222222","timestamp":"2026-03-24T04:48:25.000Z","type":"assistant","sessionId":"s1"}
{"malformed": garbage
{"uuid":"33333333-3333-3333-3333-333333333333","timestamp":"2026-03-24T04:48:26.000Z","type":"user","sessionId":"s1"}
```

- [ ] **Step 2: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { readJsonlLines } from '../src/jsonl.js'
import { resolve } from 'node:path'

const FIXTURE = resolve(__dirname, 'fixtures/sample.jsonl')

describe('jsonl reader', () => {
  it('reads valid lines and skips malformed ones', async () => {
    const out: unknown[] = []
    const errors: Array<{ line: number; error: string }> = []
    for await (const { value, lineNumber, error } of readJsonlLines(FIXTURE)) {
      if (error) errors.push({ line: lineNumber, error: error.message })
      else out.push(value)
    }
    expect(out).toHaveLength(3)
    expect(errors).toHaveLength(1)
    expect(errors[0]?.line).toBe(3)
  })

  it('supports starting at a byte offset', async () => {
    const fs = await import('node:fs/promises')
    const full = await fs.readFile(FIXTURE, 'utf8')
    const firstLineLen = (full.split('\n')[0]?.length ?? 0) + 1
    const out: unknown[] = []
    for await (const { value, error } of readJsonlLines(FIXTURE, { startOffset: firstLineLen })) {
      if (!error && value) out.push(value)
    }
    expect(out).toHaveLength(2) // skipped first line
  })
})
```

- [ ] **Step 3: Run — expect failure**

```bash
pnpm test -- jsonl
```

- [ ] **Step 4: Write `packages/parsers/src/jsonl.ts`**

```ts
import { createReadStream } from 'node:fs'
import { createInterface } from 'node:readline'

export interface JsonlLineResult {
  value: unknown
  raw: string
  lineNumber: number
  byteOffset: number
  error?: Error
}

export interface ReadOptions {
  startOffset?: number
}

export async function* readJsonlLines(
  path: string,
  opts: ReadOptions = {},
): AsyncGenerator<JsonlLineResult> {
  const stream = createReadStream(path, {
    encoding: 'utf8',
    start: opts.startOffset ?? 0,
  })
  const rl = createInterface({ input: stream, crlfDelay: Infinity })
  let lineNumber = 0
  let byteOffset = opts.startOffset ?? 0
  for await (const line of rl) {
    lineNumber += 1
    const byteLength = Buffer.byteLength(line, 'utf8') + 1 // + newline
    byteOffset += byteLength
    if (line.length === 0) continue
    try {
      const value = JSON.parse(line)
      yield { value, raw: line, lineNumber, byteOffset }
    } catch (e) {
      yield { value: null, raw: line, lineNumber, byteOffset, error: e as Error }
    }
  }
}
```

- [ ] **Step 5: Run — expect PASS**

```bash
pnpm test -- jsonl
```

- [ ] **Step 6: Commit**

```bash
git add packages/parsers/
git commit -m "feat(parsers): streaming JSONL reader with malformed-line tolerance"
```

---

## Task 17: Parsers — transcript event typing

**Files:**
- Create: `packages/parsers/src/transcript.ts`
- Create: `packages/parsers/tests/transcript.test.ts`
- Create: `packages/parsers/tests/fixtures/transcript-sample.jsonl`

**Context:** This converts raw JSONL lines into `ParsedEvent` records, extracting discriminator fields (type, subtype), timestamps, identity fields, and setting `isSidechain` based on the filename.

- [ ] **Step 1: Create fixture `packages/parsers/tests/fixtures/transcript-sample.jsonl`** — representative shapes from real data:

```
{"parentUuid":null,"isSidechain":false,"type":"progress","data":{"type":"hook_progress","hookEvent":"SessionStart"},"uuid":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","timestamp":"2026-03-24T04:48:24.639Z","cwd":"/Users/x/proj","sessionId":"s1","version":"2.1.81","gitBranch":"main","entrypoint":"cli"}
{"parentUuid":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","isSidechain":false,"type":"user","message":{"role":"user","content":"hello"},"uuid":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","timestamp":"2026-03-24T04:48:31.881Z","sessionId":"s1","cwd":"/Users/x/proj","version":"2.1.81","gitBranch":"main","entrypoint":"cli"}
{"parentUuid":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","isSidechain":false,"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"hi!"},{"type":"tool_use","id":"tu1","name":"Read","input":{"file_path":"/x"}}],"model":"claude-sonnet-4-6","usage":{"input_tokens":10,"output_tokens":5,"cache_creation_input_tokens":0,"cache_read_input_tokens":0}},"uuid":"cccccccc-cccc-cccc-cccc-cccccccccccc","timestamp":"2026-03-24T04:48:32.000Z","sessionId":"s1","requestId":"req_1","cwd":"/Users/x/proj","version":"2.1.81"}
{"parentUuid":"cccccccc-cccc-cccc-cccc-cccccccccccc","isSidechain":false,"type":"user","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"tu1","content":"file contents"}]},"uuid":"dddddddd-dddd-dddd-dddd-dddddddddddd","timestamp":"2026-03-24T04:48:32.500Z","sessionId":"s1","cwd":"/Users/x/proj","version":"2.1.81"}
```

- [ ] **Step 2: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { resolve } from 'node:path'
import { readTranscript } from '../src/transcript.js'

const FIXTURE = resolve(__dirname, 'fixtures/transcript-sample.jsonl')

describe('transcript parser', () => {
  it('yields 4 typed events with correct discriminators', async () => {
    const events = []
    for await (const e of readTranscript(FIXTURE)) events.push(e)
    expect(events).toHaveLength(4)
    expect(events.map((e) => e.type)).toEqual(['progress', 'user', 'assistant', 'user'])
    expect(events[0]?.subtype).toBe('hook_progress')
    expect(events[2]?.subtype).toBe('assistant_message')
    expect(events[3]?.subtype).toBe('tool_result')
  })

  it('marks subagent files as sidechain', async () => {
    // fake path under .../subagents/agent-*.jsonl — we only check the flag logic
    const subPath = '/x/.claude/projects/-foo/subagents/agent-abc.jsonl'
    // Since we're not reading a real file, construct via helper
    const { isSidechainPath } = await import('../src/transcript.js')
    expect(isSidechainPath(subPath)).toBe(true)
    expect(isSidechainPath('/x/.claude/projects/-foo/abc.jsonl')).toBe(false)
  })

  it('extracts agent_id from subagent filename', async () => {
    const { agentIdFromPath } = await import('../src/transcript.js')
    expect(agentIdFromPath('/x/subagents/agent-abc123.jsonl')).toBe('abc123')
    expect(agentIdFromPath('/x/abc.jsonl')).toBeNull()
  })
})
```

- [ ] **Step 3: Run — expect failure**

```bash
pnpm test -- transcript
```

- [ ] **Step 4: Write `packages/parsers/src/transcript.ts`**

```ts
import { projectPathFromFile } from '@cca/core'
import type { ParsedEvent, EventType } from '@cca/core'
import { readJsonlLines } from './jsonl.js'

export function isSidechainPath(file: string): boolean {
  return /\/subagents\/agent-[^/]+\.jsonl$/.test(file)
}

export function agentIdFromPath(file: string): string | null {
  const m = file.match(/\/subagents\/agent-([^/]+)\.jsonl$/)
  return m?.[1] ?? null
}

// Discriminate subtype from the raw line.
function deriveSubtype(raw: Record<string, unknown>): string | null {
  const type = raw.type as string
  if (type === 'progress') {
    const data = raw.data as { type?: string } | undefined
    return data?.type ?? null
  }
  if (type === 'assistant') return 'assistant_message'
  if (type === 'user') {
    const msg = raw.message as { content?: unknown } | undefined
    const content = msg?.content
    if (Array.isArray(content) && content.some((c: any) => c?.type === 'tool_result')) {
      return 'tool_result'
    }
    return 'user_message'
  }
  if (type === 'file-history-snapshot') return 'file_snapshot'
  return null
}

export async function* readTranscript(file: string): AsyncGenerator<ParsedEvent> {
  const sidechain = isSidechainPath(file)
  const agentId = agentIdFromPath(file)
  const projectPath = projectPathFromFile(file)
  for await (const { value, error } of readJsonlLines(file)) {
    if (error || !value || typeof value !== 'object') continue
    const raw = value as Record<string, unknown>
    const uuid = raw.uuid as string | undefined
    const timestamp = raw.timestamp as string | undefined
    const type = raw.type as EventType | undefined
    if (!uuid || !timestamp || !type) continue
    yield {
      uuid,
      sessionId: (raw.sessionId as string | undefined) ?? 'unknown',
      parentUuid: (raw.parentUuid as string | null | undefined) ?? null,
      type,
      subtype: deriveSubtype(raw),
      timestamp: new Date(timestamp),
      cwd: (raw.cwd as string | undefined) ?? null,
      projectPath,
      gitBranch: (raw.gitBranch as string | undefined) ?? null,
      ccVersion: (raw.version as string | undefined) ?? null,
      entrypoint: (raw.entrypoint as string | undefined) ?? null,
      isSidechain: sidechain || Boolean(raw.isSidechain),
      agentId: agentId ?? ((raw.agentId as string | undefined) ?? null),
      requestId: (raw.requestId as string | undefined) ?? null,
      payload: raw,
      sourceFile: file,
    }
  }
}
```

- [ ] **Step 5: Run — expect PASS**

```bash
pnpm test -- transcript
```

- [ ] **Step 6: Commit**

```bash
git add packages/parsers/
git commit -m "feat(parsers): transcript parser with subagent detection"
```

---

## Task 18: Parsers — history.jsonl

**Files:**
- Create: `packages/parsers/src/history.ts`
- Create: `packages/parsers/tests/history.test.ts`
- Create: `packages/parsers/tests/fixtures/history.jsonl`

- [ ] **Step 1: Create fixture `packages/parsers/tests/fixtures/history.jsonl`**

```
{"display":"/init ","pastedContents":{},"timestamp":1759454862042,"project":"/Users/x/proj-a"}
{"display":"make it faster","pastedContents":{},"timestamp":1759495772154,"project":"/Users/x/proj-b"}
```

- [ ] **Step 2: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { resolve } from 'node:path'
import { readHistory } from '../src/history.js'

const FIXTURE = resolve(__dirname, 'fixtures/history.jsonl')

describe('history parser', () => {
  it('parses prompt history entries', async () => {
    const entries = []
    for await (const e of readHistory(FIXTURE)) entries.push(e)
    expect(entries).toHaveLength(2)
    expect(entries[0]?.display).toBe('/init ')
    expect(entries[0]?.projectPath).toBe('/Users/x/proj-a')
    expect(entries[0]?.typedAt.getTime()).toBe(1759454862042)
  })
})
```

- [ ] **Step 3: Run — expect failure**

```bash
pnpm test -- history
```

- [ ] **Step 4: Write `packages/parsers/src/history.ts`**

```ts
import { readJsonlLines } from './jsonl.js'

export interface HistoryEntry {
  display: string
  pastedContents: unknown
  typedAt: Date
  projectPath: string | null
}

export async function* readHistory(file: string): AsyncGenerator<HistoryEntry> {
  for await (const { value, error } of readJsonlLines(file)) {
    if (error || !value || typeof value !== 'object') continue
    const raw = value as Record<string, unknown>
    const ts = raw.timestamp as number | undefined
    const display = raw.display as string | undefined
    if (typeof ts !== 'number' || typeof display !== 'string') continue
    yield {
      display,
      pastedContents: raw.pastedContents ?? {},
      typedAt: new Date(ts),
      projectPath: (raw.project as string | undefined) ?? null,
    }
  }
}
```

- [ ] **Step 5: Run — expect PASS**

```bash
pnpm test -- history
```

- [ ] **Step 6: Commit**

```bash
git add packages/parsers/
git commit -m "feat(parsers): history.jsonl reader"
```

---

## Task 19: Parsers — todos

**Files:**
- Create: `packages/parsers/src/todos.ts`
- Create: `packages/parsers/tests/todos.test.ts`
- Create: `packages/parsers/tests/fixtures/todos/`

- [ ] **Step 1: Create fixtures**

`packages/parsers/tests/fixtures/todos/session1-agent-session1.json`:
```json
[{"id":"1","content":"do thing","status":"completed"},{"id":"2","content":"other thing","status":"pending"}]
```

`packages/parsers/tests/fixtures/todos/session2-agent-subA.json`:
```json
[]
```

- [ ] **Step 2: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { resolve } from 'node:path'
import { readTodosDir } from '../src/todos.js'

const DIR = resolve(__dirname, 'fixtures/todos')

describe('todos parser', () => {
  it('reads all todo files and extracts session/agent ids', async () => {
    const out = []
    for await (const t of readTodosDir(DIR)) out.push(t)
    expect(out).toHaveLength(2)
    const s1 = out.find((t) => t.sessionId === 'session1')
    expect(s1?.agentId).toBe('session1')
    expect(Array.isArray(s1?.todos)).toBe(true)
    expect((s1?.todos as unknown[]).length).toBe(2)
  })
})
```

- [ ] **Step 3: Run — expect failure**

```bash
pnpm test -- todos
```

- [ ] **Step 4: Write `packages/parsers/src/todos.ts`**

```ts
import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'

export interface TodoSnapshot {
  sessionId: string
  agentId: string
  snapshotAt: Date
  todos: unknown
  sourceFile: string
}

// Filenames look like: <sessionId>-agent-<agentId>.json
const PATTERN = /^([a-f0-9\-]+)-agent-([^.]+)\.json$/

export async function* readTodosDir(dir: string): AsyncGenerator<TodoSnapshot> {
  const entries = await readdir(dir)
  for (const entry of entries) {
    const m = entry.match(PATTERN)
    if (!m) continue
    const [, sessionId, agentId] = m
    const filePath = join(dir, entry)
    const stats = await stat(filePath)
    const body = await readFile(filePath, 'utf8')
    try {
      const todos = JSON.parse(body) as unknown
      yield {
        sessionId: sessionId!,
        agentId: agentId!,
        snapshotAt: stats.mtime,
        todos,
        sourceFile: filePath,
      }
    } catch {
      // skip malformed
    }
  }
}
```

- [ ] **Step 5: Run — expect PASS**

```bash
pnpm test -- todos
```

- [ ] **Step 6: Commit**

```bash
git add packages/parsers/
git commit -m "feat(parsers): todos directory reader"
```

---

## Task 20: Parsers — file history

**Files:**
- Create: `packages/parsers/src/fileHistory.ts`
- Create: `packages/parsers/tests/fileHistory.test.ts`
- Create: `packages/parsers/tests/fixtures/file-history/session-abc/`

**Context:** File-history layout observed on disk: `~/.claude/file-history/<sessionId>/<hash>@v<N>` — the hash encodes the file path (obscure), and `@vN` is the version. Content is the raw file bytes.

- [ ] **Step 1: Create fixtures**

`packages/parsers/tests/fixtures/file-history/session-abc/12a93c8900000000@v1`:
```
# original file contents
line 2
```

`packages/parsers/tests/fixtures/file-history/session-abc/12a93c8900000000@v2`:
```
# file contents v2
line 2
line 3
```

- [ ] **Step 2: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { resolve } from 'node:path'
import { readFileHistoryDir } from '../src/fileHistory.js'

const ROOT = resolve(__dirname, 'fixtures/file-history')

describe('file-history parser', () => {
  it('reads versioned snapshots and computes sha256', async () => {
    const out = []
    for await (const s of readFileHistoryDir(ROOT)) out.push(s)
    expect(out).toHaveLength(2)
    expect(out.map((s) => s.version).sort()).toEqual([1, 2])
    expect(out.every((s) => s.sessionId === 'session-abc')).toBe(true)
    expect(out.every((s) => typeof s.sha256 === 'string' && s.sha256.length === 64)).toBe(true)
  })
})
```

- [ ] **Step 3: Run — expect failure**

```bash
pnpm test -- fileHistory
```

- [ ] **Step 4: Write `packages/parsers/src/fileHistory.ts`**

```ts
import { createHash } from 'node:crypto'
import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'

export interface FileSnapshot {
  sessionId: string
  filePath: string        // the hash key from CC (we don't recover original name here)
  version: number
  snapshotAt: Date
  content: string | null  // null if binary
  sha256: string
  sourceFile: string
}

const VERSION_RE = /^(.+)@v(\d+)$/

export async function* readFileHistoryDir(root: string): AsyncGenerator<FileSnapshot> {
  const sessions = await readdir(root, { withFileTypes: true })
  for (const sessDir of sessions) {
    if (!sessDir.isDirectory()) continue
    const sessionId = sessDir.name
    const full = join(root, sessionId)
    const entries = await readdir(full)
    for (const entry of entries) {
      const m = entry.match(VERSION_RE)
      if (!m) continue
      const [, hashKey, vStr] = m
      const path = join(full, entry)
      const stats = await stat(path)
      const buf = await readFile(path)
      const sha256 = createHash('sha256').update(buf).digest('hex')
      const asString = buf.toString('utf8')
      // crude binary detection: null bytes = binary
      const isBinary = buf.includes(0)
      yield {
        sessionId,
        filePath: hashKey!,
        version: Number(vStr),
        snapshotAt: stats.mtime,
        content: isBinary ? null : asString,
        sha256,
        sourceFile: path,
      }
    }
  }
}
```

- [ ] **Step 5: Run — expect PASS**

```bash
pnpm test -- fileHistory
```

- [ ] **Step 6: Commit**

```bash
git add packages/parsers/
git commit -m "feat(parsers): file-history directory reader with sha256"
```

---

## Task 21: Parsers — shell snapshots

**Files:**
- Create: `packages/parsers/src/shellSnapshots.ts`
- Create: `packages/parsers/tests/shellSnapshots.test.ts`
- Create: `packages/parsers/tests/fixtures/shell-snapshots/`

- [ ] **Step 1: Create fixtures**

`packages/parsers/tests/fixtures/shell-snapshots/snapshot-zsh-1752714645586-8gx82k.sh`:
```sh
# shell state at capture
export PATH=/usr/local/bin:/usr/bin
```

- [ ] **Step 2: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { resolve } from 'node:path'
import { readShellSnapshotsDir } from '../src/shellSnapshots.js'

const DIR = resolve(__dirname, 'fixtures/shell-snapshots')

describe('shell snapshots parser', () => {
  it('parses snapshots with id and timestamp from filename', async () => {
    const out = []
    for await (const s of readShellSnapshotsDir(DIR)) out.push(s)
    expect(out).toHaveLength(1)
    expect(out[0]?.id).toBe('snapshot-zsh-1752714645586-8gx82k')
    expect(out[0]?.capturedAt.getTime()).toBe(1752714645586)
    expect(out[0]?.content).toContain('export PATH')
  })
})
```

- [ ] **Step 3: Run — expect failure**

```bash
pnpm test -- shellSnapshots
```

- [ ] **Step 4: Write `packages/parsers/src/shellSnapshots.ts`**

```ts
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

export interface ShellSnapshot {
  id: string
  capturedAt: Date
  content: string
  sourceFile: string
}

const PATTERN = /^(snapshot-zsh-(\d+)-[^.]+)\.sh$/

export async function* readShellSnapshotsDir(dir: string): AsyncGenerator<ShellSnapshot> {
  const entries = await readdir(dir)
  for (const entry of entries) {
    const m = entry.match(PATTERN)
    if (!m) continue
    const [, id, tsStr] = m
    const filePath = join(dir, entry)
    const content = await readFile(filePath, 'utf8')
    yield {
      id: id!,
      capturedAt: new Date(Number(tsStr)),
      content,
      sourceFile: filePath,
    }
  }
}
```

- [ ] **Step 5: Run — expect PASS**

```bash
pnpm test -- shellSnapshots
```

- [ ] **Step 6: Commit**

```bash
git add packages/parsers/
git commit -m "feat(parsers): shell-snapshots directory reader"
```

---

## Task 22: Writer — events batch insert

**Files:**
- Create: `apps/ingester/src/writer/events.ts`
- Create: `apps/ingester/tests/writer.events.test.ts`

**Context:** We insert events in batches with `ON CONFLICT (uuid) DO NOTHING` so re-running backfill is safe. This task ONLY handles the raw events table; derivations happen in Task 23.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import { config } from 'dotenv'
import { resolve } from 'node:path'
config({ path: resolve(__dirname, '../../../.env.local') })

import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import { events } from '@cca/db'
import { insertEventsBatch } from '../src/writer/events.js'
import type { ParsedEvent } from '@cca/core'

const TEST_URL = process.env.CCA_DATABASE_URL_TEST!
const sql = postgres(TEST_URL, { max: 2 })
const db = drizzle(sql, { schema: { events } })

const sample: ParsedEvent = {
  uuid: '00000000-0000-0000-0000-000000000001',
  sessionId: 's-test',
  parentUuid: null,
  type: 'user',
  subtype: 'user_message',
  timestamp: new Date('2026-04-01T00:00:00Z'),
  cwd: '/x',
  projectPath: '/x',
  gitBranch: 'main',
  ccVersion: '2.1.81',
  entrypoint: 'cli',
  isSidechain: false,
  agentId: null,
  requestId: null,
  payload: { uuid: '00000000-0000-0000-0000-000000000001' },
  sourceFile: '/tmp/test.jsonl',
}

describe('writer: events', () => {
  beforeAll(async () => {
    await sql`TRUNCATE events RESTART IDENTITY CASCADE`
  })
  afterAll(async () => { await sql.end() })

  it('inserts one event', async () => {
    const n = await insertEventsBatch(db, [sample])
    expect(n).toBe(1)
    const rows = await sql`SELECT uuid FROM events WHERE uuid = ${sample.uuid}`
    expect(rows).toHaveLength(1)
  })

  it('is idempotent on uuid conflict', async () => {
    const n = await insertEventsBatch(db, [sample, sample])
    expect(n).toBe(0)  // both conflict
  })

  it('inserts 1000 in one batch', async () => {
    const batch: ParsedEvent[] = Array.from({ length: 1000 }, (_, i) => ({
      ...sample,
      uuid: `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`,
    }))
    const n = await insertEventsBatch(db, batch)
    expect(n).toBe(1000)
  })
})
```

- [ ] **Step 2: Run — expect failure**

```bash
pnpm test -- writer.events
```

- [ ] **Step 3: Write `apps/ingester/src/writer/events.ts`**

```ts
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { events } from '@cca/db'
import type * as schema from '@cca/db/schema'
import type { ParsedEvent } from '@cca/core'

type Db = PostgresJsDatabase<typeof schema>

export async function insertEventsBatch(db: Db, batch: ParsedEvent[]): Promise<number> {
  if (batch.length === 0) return 0
  const rows = batch.map((e) => ({
    uuid: e.uuid,
    sessionId: e.sessionId,
    parentUuid: e.parentUuid ?? null,
    type: e.type,
    subtype: e.subtype ?? null,
    timestamp: e.timestamp,
    cwd: e.cwd ?? null,
    projectPath: e.projectPath ?? null,
    gitBranch: e.gitBranch ?? null,
    ccVersion: e.ccVersion ?? null,
    entrypoint: e.entrypoint ?? null,
    isSidechain: e.isSidechain,
    agentId: e.agentId ?? null,
    requestId: e.requestId ?? null,
    payload: e.payload as object,
    sourceFile: e.sourceFile,
  }))
  const result = await db
    .insert(events)
    .values(rows)
    .onConflictDoNothing({ target: events.uuid })
    .returning({ uuid: events.uuid })
  return result.length
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
pnpm test -- writer.events
```

- [ ] **Step 5: Commit**

```bash
git add apps/ingester/
git commit -m "feat(ingester): batch-insert events with uuid idempotency"
```

---

## Task 23: Writer — derive messages from events

**Files:**
- Create: `apps/ingester/src/writer/deriveMessages.ts`
- Create: `apps/ingester/tests/writer.deriveMessages.test.ts`

**Context:** For each `assistant` event, pull out `model`, `usage` fields, and a flattened `textContent` from `message.content` array (concatenate `text` blocks, skip `tool_use`/`thinking`). For `user` events, flatten `message.content`. Tool results (user events with tool_result content) get `textContent` = the tool result text. `text_tsv` is computed by Postgres via a `to_tsvector('english', text_content)` trigger — simpler to set directly on insert.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { config } from 'dotenv'
import { resolve } from 'node:path'
config({ path: resolve(__dirname, '../../../.env.local') })

import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import { events, messages } from '@cca/db'
import { insertEventsBatch } from '../src/writer/events.js'
import { deriveMessagesFromEvents } from '../src/writer/deriveMessages.js'
import type { ParsedEvent } from '@cca/core'

const TEST_URL = process.env.CCA_DATABASE_URL_TEST!
const sql = postgres(TEST_URL, { max: 2 })
const db = drizzle(sql, { schema: { events, messages } })

const assistantEvent: ParsedEvent = {
  uuid: '00000000-0000-0000-0000-000000000010',
  sessionId: 's-derive',
  parentUuid: null,
  type: 'assistant',
  subtype: 'assistant_message',
  timestamp: new Date('2026-04-01T00:00:00Z'),
  cwd: null, projectPath: null, gitBranch: null, ccVersion: null, entrypoint: null,
  isSidechain: false, agentId: null, requestId: 'req1',
  sourceFile: '/tmp/x.jsonl',
  payload: {
    uuid: '00000000-0000-0000-0000-000000000010',
    message: {
      role: 'assistant',
      model: 'claude-sonnet-4-6',
      content: [
        { type: 'text', text: 'Hello world.' },
        { type: 'tool_use', id: 'tu1', name: 'Read', input: {} },
      ],
      usage: {
        input_tokens: 100,
        output_tokens: 20,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 50,
      },
    },
  },
}

describe('derive messages', () => {
  beforeAll(async () => {
    await sql`TRUNCATE events RESTART IDENTITY CASCADE`
  })
  afterAll(async () => { await sql.end() })

  it('inserts a message row with flattened text and usage', async () => {
    await insertEventsBatch(db, [assistantEvent])
    const n = await deriveMessagesFromEvents(db, [assistantEvent])
    expect(n).toBe(1)
    const rows = await sql`SELECT * FROM messages WHERE uuid = ${assistantEvent.uuid}`
    expect(rows[0]?.role).toBe('assistant')
    expect(rows[0]?.model).toBe('claude-sonnet-4-6')
    expect(rows[0]?.text_content).toBe('Hello world.')
    expect(Number(rows[0]?.input_tokens)).toBe(100)
    expect(Number(rows[0]?.output_tokens)).toBe(20)
    expect(Number(rows[0]?.cache_read_tokens)).toBe(50)
  })
})
```

- [ ] **Step 2: Run — expect failure**

```bash
pnpm test -- writer.deriveMessages
```

- [ ] **Step 3: Write `apps/ingester/src/writer/deriveMessages.ts`**

```ts
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { sql } from 'drizzle-orm'
import { messages } from '@cca/db'
import type * as schema from '@cca/db/schema'
import type { ParsedEvent } from '@cca/core'

type Db = PostgresJsDatabase<typeof schema>

interface FlatBlock { type: string; text?: string; content?: unknown }

function flattenTextContent(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  const parts: string[] = []
  for (const block of content as FlatBlock[]) {
    if (block?.type === 'text' && typeof block.text === 'string') parts.push(block.text)
    else if (block?.type === 'tool_result') {
      if (typeof block.content === 'string') parts.push(block.content)
      else if (Array.isArray(block.content)) {
        for (const inner of block.content) {
          if (typeof (inner as FlatBlock).text === 'string') parts.push((inner as FlatBlock).text!)
        }
      }
    }
  }
  return parts.join('\n')
}

export async function deriveMessagesFromEvents(db: Db, batch: ParsedEvent[]): Promise<number> {
  const rows: Array<typeof messages.$inferInsert> = []
  for (const e of batch) {
    if (e.type !== 'assistant' && e.type !== 'user') continue
    const payload = e.payload as { message?: {
      role?: string; content?: unknown; model?: string;
      usage?: {
        input_tokens?: number; output_tokens?: number;
        cache_creation_input_tokens?: number; cache_read_input_tokens?: number;
      }
    } }
    const msg = payload.message
    if (!msg) continue
    const role = msg.role === 'assistant' ? 'assistant' : 'user'
    const text = flattenTextContent(msg.content)
    rows.push({
      uuid: e.uuid,
      sessionId: e.sessionId,
      role,
      timestamp: e.timestamp,
      model: msg.model ?? null,
      textContent: text,
      inputTokens: msg.usage?.input_tokens ?? null,
      outputTokens: msg.usage?.output_tokens ?? null,
      cacheCreationTokens: msg.usage?.cache_creation_input_tokens ?? null,
      cacheReadTokens: msg.usage?.cache_read_input_tokens ?? null,
      isSidechain: e.isSidechain,
    })
  }
  if (rows.length === 0) return 0
  const result = await db
    .insert(messages)
    .values(rows)
    .onConflictDoNothing({ target: messages.uuid })
    .returning({ uuid: messages.uuid })

  // Populate text_tsv in one UPDATE (cheaper than per-row)
  await db.execute(sql`
    UPDATE messages SET text_tsv = to_tsvector('english', coalesce(text_content, ''))
    WHERE text_tsv IS NULL AND uuid = ANY(${result.map((r) => r.uuid)})
  `)
  return result.length
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
pnpm test -- writer.deriveMessages
```

- [ ] **Step 5: Commit**

```bash
git add apps/ingester/
git commit -m "feat(ingester): derive message rows with flattened text and usage"
```

---

## Task 24: Writer — derive tool calls

**Files:**
- Create: `apps/ingester/src/writer/deriveToolCalls.ts`
- Create: `apps/ingester/tests/writer.deriveToolCalls.test.ts`

**Context:** A tool call spans two events — the `assistant` event that emits a `tool_use` block, and the subsequent `user` event that carries the matching `tool_result`. We pair them by `tool_use.id === tool_result.tool_use_id` within the same session.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { config } from 'dotenv'
import { resolve } from 'node:path'
config({ path: resolve(__dirname, '../../../.env.local') })

import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import * as schema from '@cca/db/schema'
import { insertEventsBatch } from '../src/writer/events.js'
import { deriveToolCallsFromEvents } from '../src/writer/deriveToolCalls.js'
import type { ParsedEvent } from '@cca/core'

const TEST_URL = process.env.CCA_DATABASE_URL_TEST!
const sql = postgres(TEST_URL, { max: 2 })
const db = drizzle(sql, { schema })

const toolUseEvent: ParsedEvent = {
  uuid: '00000000-0000-0000-0000-000000000020',
  sessionId: 's-tool', parentUuid: null, type: 'assistant', subtype: 'assistant_message',
  timestamp: new Date('2026-04-01T00:00:00Z'),
  cwd: null, projectPath: null, gitBranch: null, ccVersion: null, entrypoint: null,
  isSidechain: false, agentId: null, requestId: null, sourceFile: '/x',
  payload: {
    uuid: '00000000-0000-0000-0000-000000000020',
    message: { role: 'assistant', content: [
      { type: 'tool_use', id: 'tu-1', name: 'Read', input: { file_path: '/x' } },
    ]},
  },
}

const toolResultEvent: ParsedEvent = {
  uuid: '00000000-0000-0000-0000-000000000021',
  sessionId: 's-tool', parentUuid: toolUseEvent.uuid, type: 'user', subtype: 'tool_result',
  timestamp: new Date('2026-04-01T00:00:00.500Z'),
  cwd: null, projectPath: null, gitBranch: null, ccVersion: null, entrypoint: null,
  isSidechain: false, agentId: null, requestId: null, sourceFile: '/x',
  payload: {
    uuid: '00000000-0000-0000-0000-000000000021',
    message: { role: 'user', content: [
      { type: 'tool_result', tool_use_id: 'tu-1', content: 'file body', is_error: false },
    ]},
  },
}

describe('derive tool_calls', () => {
  beforeAll(async () => {
    await sql`TRUNCATE events RESTART IDENTITY CASCADE`
  })
  afterAll(async () => { await sql.end() })

  it('pairs tool_use with tool_result and computes duration', async () => {
    await insertEventsBatch(db, [toolUseEvent, toolResultEvent])
    const n = await deriveToolCallsFromEvents(db, [toolUseEvent, toolResultEvent])
    expect(n).toBe(1)
    const rows = await sql`SELECT * FROM tool_calls WHERE uuid = ${toolUseEvent.uuid}`
    expect(rows[0]?.tool_name).toBe('Read')
    expect(Number(rows[0]?.duration_ms)).toBe(500)
    expect(rows[0]?.is_error).toBe(false)
    expect(rows[0]?.result_uuid).toBe(toolResultEvent.uuid)
  })
})
```

- [ ] **Step 2: Run — expect failure**

```bash
pnpm test -- writer.deriveToolCalls
```

- [ ] **Step 3: Write `apps/ingester/src/writer/deriveToolCalls.ts`**

```ts
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { toolCalls } from '@cca/db'
import type * as schema from '@cca/db/schema'
import type { ParsedEvent } from '@cca/core'

type Db = PostgresJsDatabase<typeof schema>

interface ToolUseBlock { type: 'tool_use'; id: string; name: string; input: unknown }
interface ToolResultBlock { type: 'tool_result'; tool_use_id: string; content: unknown; is_error?: boolean }

function extractToolUses(e: ParsedEvent): Array<ToolUseBlock & { parentMessageUuid: string }> {
  if (e.type !== 'assistant') return []
  const msg = (e.payload as { message?: { content?: unknown } }).message
  const content = msg?.content
  if (!Array.isArray(content)) return []
  return content
    .filter((b: any): b is ToolUseBlock => b?.type === 'tool_use')
    .map((b) => ({ ...b, parentMessageUuid: e.uuid }))
}

function extractToolResults(e: ParsedEvent): ToolResultBlock[] {
  if (e.type !== 'user') return []
  const msg = (e.payload as { message?: { content?: unknown } }).message
  const content = msg?.content
  if (!Array.isArray(content)) return []
  return content.filter((b: any): b is ToolResultBlock => b?.type === 'tool_result')
}

export async function deriveToolCallsFromEvents(db: Db, batch: ParsedEvent[]): Promise<number> {
  // Index results by tool_use_id within the batch — sufficient for streaming since tool results
  // appear in the SAME file, close to their tool_use event.
  const resultIndex = new Map<string, { event: ParsedEvent; block: ToolResultBlock }>()
  for (const e of batch) {
    for (const r of extractToolResults(e)) resultIndex.set(r.tool_use_id, { event: e, block: r })
  }

  const rows: Array<typeof toolCalls.$inferInsert> = []
  for (const e of batch) {
    for (const use of extractToolUses(e)) {
      const pair = resultIndex.get(use.id)
      const durationMs = pair
        ? Math.max(0, pair.event.timestamp.getTime() - e.timestamp.getTime())
        : null
      rows.push({
        uuid: e.uuid,
        sessionId: e.sessionId,
        timestamp: e.timestamp,
        toolName: use.name,
        input: use.input as object,
        result: (pair?.block.content as object | undefined) ?? null,
        resultUuid: pair?.event.uuid ?? null,
        durationMs,
        isError: pair?.block.is_error ?? null,
        parentMessageUuid: use.parentMessageUuid,
      })
    }
  }
  if (rows.length === 0) return 0
  const result = await db
    .insert(toolCalls)
    .values(rows)
    .onConflictDoNothing({ target: toolCalls.uuid })
    .returning({ uuid: toolCalls.uuid })
  return result.length
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
pnpm test -- writer.deriveToolCalls
```

- [ ] **Step 5: Commit**

```bash
git add apps/ingester/
git commit -m "feat(ingester): derive tool_calls pairing tool_use with tool_result"
```

---

## Task 25: Writer — rollup sessions

**Files:**
- Create: `apps/ingester/src/writer/deriveSessions.ts`
- Create: `apps/ingester/tests/writer.deriveSessions.test.ts`

**Context:** Sessions are rolled up at the end of each ingest batch by aggregating over the derived tables in SQL — not by accumulating in memory. This keeps the logic simple and always-correct even when events arrive out of order.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { config } from 'dotenv'
import { resolve } from 'node:path'
config({ path: resolve(__dirname, '../../../.env.local') })

import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import * as schema from '@cca/db/schema'
import { insertEventsBatch } from '../src/writer/events.js'
import { deriveMessagesFromEvents } from '../src/writer/deriveMessages.js'
import { rollupSessions } from '../src/writer/deriveSessions.js'
import type { ParsedEvent } from '@cca/core'

const TEST_URL = process.env.CCA_DATABASE_URL_TEST!
const sql = postgres(TEST_URL, { max: 2 })
const db = drizzle(sql, { schema })

describe('rollup sessions', () => {
  beforeAll(async () => {
    await sql`TRUNCATE events RESTART IDENTITY CASCADE`
    await sql`TRUNCATE sessions RESTART IDENTITY CASCADE`
  })
  afterAll(async () => { await sql.end() })

  it('produces a session row with counts, tokens, and cost', async () => {
    const e1: ParsedEvent = {
      uuid: '00000000-0000-0000-0000-000000000100', sessionId: 's-roll', parentUuid: null,
      type: 'user', subtype: 'user_message', timestamp: new Date('2026-04-01T00:00:00Z'),
      cwd: '/p', projectPath: '/p', gitBranch: 'main', ccVersion: '2.1.81', entrypoint: 'cli',
      isSidechain: false, agentId: null, requestId: null, sourceFile: '/x',
      payload: { message: { role: 'user', content: 'first prompt' } },
    }
    const e2: ParsedEvent = {
      uuid: '00000000-0000-0000-0000-000000000101', sessionId: 's-roll', parentUuid: e1.uuid,
      type: 'assistant', subtype: 'assistant_message', timestamp: new Date('2026-04-01T00:01:00Z'),
      cwd: '/p', projectPath: '/p', gitBranch: 'main', ccVersion: '2.1.81', entrypoint: 'cli',
      isSidechain: false, agentId: null, requestId: null, sourceFile: '/x',
      payload: { message: {
        role: 'assistant', model: 'claude-sonnet-4-6',
        content: [{ type: 'text', text: 'ok' }],
        usage: { input_tokens: 1_000_000, output_tokens: 500_000, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
      }},
    }
    await insertEventsBatch(db, [e1, e2])
    await deriveMessagesFromEvents(db, [e1, e2])
    await rollupSessions(db, ['s-roll'])

    const rows = await sql`SELECT * FROM sessions WHERE session_id = 's-roll'`
    expect(rows).toHaveLength(1)
    expect(rows[0]?.message_count).toBe(2)
    expect(rows[0]?.project_path).toBe('/p')
    expect(Number(rows[0]?.total_input_tokens)).toBe(1_000_000)
    expect(Number(rows[0]?.total_output_tokens)).toBe(500_000)
    expect(Number(rows[0]?.estimated_cost_usd)).toBeCloseTo(10.5, 2) // 1M*3 + 0.5M*15
    expect(rows[0]?.first_user_prompt).toBe('first prompt')
  })
})
```

- [ ] **Step 2: Run — expect failure**

```bash
pnpm test -- writer.deriveSessions
```

- [ ] **Step 3: Write `apps/ingester/src/writer/deriveSessions.ts`**

```ts
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { sql } from 'drizzle-orm'
import type * as schema from '@cca/db/schema'

type Db = PostgresJsDatabase<typeof schema>

// Recomputes session rollups for a list of session_ids, joining events + messages + tool_calls
// and computing cost via model_pricing. This is idempotent and always correct.
export async function rollupSessions(db: Db, sessionIds: string[]): Promise<void> {
  if (sessionIds.length === 0) return
  await db.execute(sql`
    INSERT INTO sessions (
      session_id, project_path, started_at, ended_at, duration_sec,
      message_count, tool_call_count, subagent_count,
      git_branch, cc_version, models_used,
      total_input_tokens, total_output_tokens, total_cache_creation, total_cache_read,
      estimated_cost_usd, first_user_prompt, status
    )
    SELECT
      e.session_id,
      (array_agg(e.project_path) FILTER (WHERE e.project_path IS NOT NULL))[1] AS project_path,
      MIN(e.timestamp) AS started_at,
      MAX(e.timestamp) AS ended_at,
      EXTRACT(EPOCH FROM (MAX(e.timestamp) - MIN(e.timestamp)))::int AS duration_sec,
      COUNT(*) FILTER (WHERE e.type IN ('user','assistant')) AS message_count,
      (SELECT COUNT(*) FROM tool_calls tc WHERE tc.session_id = e.session_id) AS tool_call_count,
      COUNT(DISTINCT e.agent_id) FILTER (WHERE e.is_sidechain) AS subagent_count,
      (array_agg(e.git_branch) FILTER (WHERE e.git_branch IS NOT NULL))[1] AS git_branch,
      (array_agg(e.cc_version) FILTER (WHERE e.cc_version IS NOT NULL))[1] AS cc_version,
      ARRAY(
        SELECT DISTINCT m.model FROM messages m
        WHERE m.session_id = e.session_id AND m.model IS NOT NULL
      ) AS models_used,
      COALESCE(SUM(m.input_tokens), 0),
      COALESCE(SUM(m.output_tokens), 0),
      COALESCE(SUM(m.cache_creation_tokens), 0),
      COALESCE(SUM(m.cache_read_tokens), 0),
      (
        SELECT COALESCE(SUM(
            (m2.input_tokens::numeric / 1000000) * p.input_per_mtok
          + (m2.output_tokens::numeric / 1000000) * p.output_per_mtok
          + (m2.cache_creation_tokens::numeric / 1000000) * p.cache_write_5m_per_mtok
          + (m2.cache_read_tokens::numeric / 1000000) * p.cache_read_per_mtok
        ), 0)::numeric(10,4)
        FROM messages m2
        LEFT JOIN model_pricing p ON p.model = m2.model
        WHERE m2.session_id = e.session_id AND m2.role = 'assistant'
      ) AS estimated_cost_usd,
      (
        SELECT m3.text_content FROM messages m3
        WHERE m3.session_id = e.session_id AND m3.role = 'user'
        ORDER BY m3.timestamp ASC LIMIT 1
      ) AS first_user_prompt,
      'ended' AS status
    FROM events e
    LEFT JOIN messages m ON m.uuid = e.uuid
    WHERE e.session_id = ANY(${sessionIds})
    GROUP BY e.session_id
    ON CONFLICT (session_id) DO UPDATE SET
      project_path       = EXCLUDED.project_path,
      started_at         = EXCLUDED.started_at,
      ended_at           = EXCLUDED.ended_at,
      duration_sec       = EXCLUDED.duration_sec,
      message_count      = EXCLUDED.message_count,
      tool_call_count    = EXCLUDED.tool_call_count,
      subagent_count     = EXCLUDED.subagent_count,
      git_branch         = EXCLUDED.git_branch,
      cc_version         = EXCLUDED.cc_version,
      models_used        = EXCLUDED.models_used,
      total_input_tokens = EXCLUDED.total_input_tokens,
      total_output_tokens= EXCLUDED.total_output_tokens,
      total_cache_creation=EXCLUDED.total_cache_creation,
      total_cache_read   = EXCLUDED.total_cache_read,
      estimated_cost_usd = EXCLUDED.estimated_cost_usd,
      first_user_prompt  = EXCLUDED.first_user_prompt,
      status             = EXCLUDED.status
  `)
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
pnpm test -- writer.deriveSessions
```

- [ ] **Step 5: Commit**

```bash
git add apps/ingester/
git commit -m "feat(ingester): session rollup recomputes idempotently"
```

---

## Task 26: Backfill — file enumerator

**Files:**
- Create: `apps/ingester/src/backfill/enumerate.ts`
- Create: `apps/ingester/tests/backfill.enumerate.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { enumerateSources } from '../src/backfill/enumerate.js'

describe('enumerate sources', () => {
  it('finds transcripts (including subagents), history, todos, file-history, shell-snapshots', () => {
    const root = mkdtempSync(join(tmpdir(), 'cca-'))
    mkdirSync(join(root, 'projects/-x'), { recursive: true })
    mkdirSync(join(root, 'projects/-x/sid/subagents'), { recursive: true })
    mkdirSync(join(root, 'todos'), { recursive: true })
    mkdirSync(join(root, 'file-history/sess'), { recursive: true })
    mkdirSync(join(root, 'shell-snapshots'), { recursive: true })
    writeFileSync(join(root, 'projects/-x/session.jsonl'), '')
    writeFileSync(join(root, 'projects/-x/sid/subagents/agent-a.jsonl'), '')
    writeFileSync(join(root, 'history.jsonl'), '')
    writeFileSync(join(root, 'todos/a-agent-b.json'), '[]')
    writeFileSync(join(root, 'file-history/sess/hash@v1'), 'content')
    writeFileSync(join(root, 'shell-snapshots/snapshot-zsh-1-x.sh'), '')

    const s = enumerateSources(root)
    expect(s.transcripts).toHaveLength(2)
    expect(s.transcripts.some((p) => p.endsWith('agent-a.jsonl'))).toBe(true)
    expect(s.history).toBe(join(root, 'history.jsonl'))
    expect(s.todosDir).toBe(join(root, 'todos'))
    expect(s.fileHistoryDir).toBe(join(root, 'file-history'))
    expect(s.shellSnapshotsDir).toBe(join(root, 'shell-snapshots'))
  })
})
```

- [ ] **Step 2: Run — expect failure**

```bash
pnpm test -- backfill.enumerate
```

- [ ] **Step 3: Write `apps/ingester/src/backfill/enumerate.ts`**

```ts
import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

export interface Sources {
  transcripts: string[]
  history: string | null
  todosDir: string | null
  fileHistoryDir: string | null
  shellSnapshotsDir: string | null
}

function walkJsonl(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) walkJsonl(full, out)
    else if (entry.isFile() && entry.name.endsWith('.jsonl')) out.push(full)
  }
  return out
}

export function enumerateSources(claudeHome: string): Sources {
  return {
    transcripts: walkJsonl(join(claudeHome, 'projects')),
    history: existsSync(join(claudeHome, 'history.jsonl'))
      ? join(claudeHome, 'history.jsonl') : null,
    todosDir: existsSync(join(claudeHome, 'todos'))
      ? join(claudeHome, 'todos') : null,
    fileHistoryDir: existsSync(join(claudeHome, 'file-history'))
      ? join(claudeHome, 'file-history') : null,
    shellSnapshotsDir: existsSync(join(claudeHome, 'shell-snapshots'))
      ? join(claudeHome, 'shell-snapshots') : null,
  }
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
pnpm test -- backfill.enumerate
```

- [ ] **Step 5: Commit**

```bash
git add apps/ingester/
git commit -m "feat(ingester): enumerate all ~/.claude source files"
```

---

## Task 27: Backfill — ancillary ingest

**Files:**
- Create: `apps/ingester/src/backfill/ancillary.ts`

- [ ] **Step 1: Write `apps/ingester/src/backfill/ancillary.ts`**

```ts
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { sql } from 'drizzle-orm'
import {
  promptsHistory, todos, fileSnapshots, shellSnapshots,
} from '@cca/db'
import type * as schema from '@cca/db/schema'
import {
  readHistory, readTodosDir, readFileHistoryDir, readShellSnapshotsDir,
} from '@cca/parsers'

type Db = PostgresJsDatabase<typeof schema>

export async function ingestHistory(db: Db, file: string | null): Promise<number> {
  if (!file) return 0
  const batch: Array<typeof promptsHistory.$inferInsert> = []
  for await (const e of readHistory(file)) {
    batch.push({
      display: e.display,
      pastedContents: e.pastedContents as object,
      typedAt: e.typedAt,
      projectPath: e.projectPath,
    })
  }
  if (batch.length === 0) return 0
  const res = await db
    .insert(promptsHistory)
    .values(batch)
    .onConflictDoNothing()
    .returning({ id: promptsHistory.id })
  return res.length
}

export async function ingestTodos(db: Db, dir: string | null): Promise<number> {
  if (!dir) return 0
  const batch: Array<typeof todos.$inferInsert> = []
  for await (const t of readTodosDir(dir)) {
    batch.push({
      sessionId: t.sessionId, agentId: t.agentId,
      snapshotAt: t.snapshotAt, todos: t.todos as object,
    })
  }
  if (batch.length === 0) return 0
  const res = await db.insert(todos).values(batch).onConflictDoNothing().returning({ sessionId: todos.sessionId })
  return res.length
}

export async function ingestFileHistory(db: Db, dir: string | null): Promise<number> {
  if (!dir) return 0
  let count = 0
  const buf: Array<typeof fileSnapshots.$inferInsert> = []
  const flush = async () => {
    if (buf.length === 0) return
    await db.insert(fileSnapshots).values(buf).onConflictDoNothing()
    count += buf.length
    buf.length = 0
  }
  for await (const s of readFileHistoryDir(dir)) {
    buf.push({
      sessionId: s.sessionId, filePath: s.filePath, version: s.version,
      snapshotAt: s.snapshotAt, content: s.content, sha256: s.sha256,
    })
    if (buf.length >= 200) await flush()
  }
  await flush()
  return count
}

export async function ingestShellSnapshots(db: Db, dir: string | null): Promise<number> {
  if (!dir) return 0
  const batch: Array<typeof shellSnapshots.$inferInsert> = []
  for await (const s of readShellSnapshotsDir(dir)) {
    batch.push({ id: s.id, capturedAt: s.capturedAt, content: s.content })
  }
  if (batch.length === 0) return 0
  const res = await db.insert(shellSnapshots).values(batch).onConflictDoNothing().returning({ id: shellSnapshots.id })
  return res.length
}

export async function refreshMaterializedViews(db: Db): Promise<void> {
  await db.execute(sql`REFRESH MATERIALIZED VIEW CONCURRENTLY usage_daily`)
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @cca/ingester typecheck
```

- [ ] **Step 3: Commit**

```bash
git add apps/ingester/
git commit -m "feat(ingester): ancillary stream ingest + MV refresh helper"
```

---

## Task 28: Backfill — orchestrator with progress

**Files:**
- Create: `apps/ingester/src/backfill/orchestrator.ts`
- Create: `apps/ingester/src/cli.ts`

- [ ] **Step 1: Write `apps/ingester/src/backfill/orchestrator.ts`**

```ts
import { SingleBar, Presets } from 'cli-progress'
import { statSync } from 'node:fs'
import pLimit from 'p-limit'
import pc from 'picocolors'

import { getDb, ingestCursors } from '@cca/db'
import { sql } from 'drizzle-orm'
import { readTranscript } from '@cca/parsers'
import type { ParsedEvent } from '@cca/core'

import { enumerateSources } from './enumerate.js'
import {
  ingestHistory, ingestTodos, ingestFileHistory, ingestShellSnapshots, refreshMaterializedViews,
} from './ancillary.js'
import { insertEventsBatch } from '../writer/events.js'
import { deriveMessagesFromEvents } from '../writer/deriveMessages.js'
import { deriveToolCallsFromEvents } from '../writer/deriveToolCalls.js'
import { rollupSessions } from '../writer/deriveSessions.js'

const BATCH_SIZE = 1000

async function ingestTranscriptFile(db: ReturnType<typeof getDb>, file: string): Promise<{ events: number; sessions: Set<string> }> {
  const sessions = new Set<string>()
  let events = 0
  let buf: ParsedEvent[] = []
  const flush = async () => {
    if (buf.length === 0) return
    const n = await insertEventsBatch(db, buf)
    await deriveMessagesFromEvents(db, buf)
    await deriveToolCallsFromEvents(db, buf)
    events += n
    buf = []
  }
  for await (const e of readTranscript(file)) {
    sessions.add(e.sessionId)
    buf.push(e)
    if (buf.length >= BATCH_SIZE) await flush()
  }
  await flush()
  // Persist cursor at EOF
  const size = statSync(file).size
  await db
    .insert(ingestCursors)
    .values({ sourceFile: file, byteOffset: size })
    .onConflictDoUpdate({
      target: ingestCursors.sourceFile,
      set: { byteOffset: size, updatedAt: sql`now()` },
    })
  return { events, sessions }
}

export async function backfillAll(claudeHome: string, opts: { concurrency?: number } = {}): Promise<void> {
  const db = getDb()
  const sources = enumerateSources(claudeHome)
  console.log(pc.dim(`found ${sources.transcripts.length} transcript files`))

  const bar = new SingleBar({
    format: `${pc.cyan('{bar}')} {percentage}% | {value}/{total} files | events: {events} | sessions: {sessions}`,
  }, Presets.shades_classic)
  bar.start(sources.transcripts.length, 0, { events: 0, sessions: 0 })

  const limit = pLimit(opts.concurrency ?? 6)
  const allSessions = new Set<string>()
  let totalEvents = 0
  let done = 0

  await Promise.all(
    sources.transcripts.map((f) => limit(async () => {
      try {
        const { events, sessions } = await ingestTranscriptFile(db, f)
        totalEvents += events
        for (const s of sessions) allSessions.add(s)
      } catch (e) {
        console.error(pc.red(`\nfailed ${f}: ${(e as Error).message}`))
      } finally {
        done += 1
        bar.update(done, { events: totalEvents, sessions: allSessions.size })
      }
    })),
  )
  bar.stop()

  console.log(pc.dim('rolling up sessions...'))
  const chunks = chunk([...allSessions], 500)
  for (const c of chunks) await rollupSessions(db, c)

  console.log(pc.dim('ingesting ancillary streams...'))
  const h = await ingestHistory(db, sources.history)
  const t = await ingestTodos(db, sources.todosDir)
  const fh = await ingestFileHistory(db, sources.fileHistoryDir)
  const ss = await ingestShellSnapshots(db, sources.shellSnapshotsDir)
  console.log(pc.dim(`  history: ${h}, todos: ${t}, file snapshots: ${fh}, shell: ${ss}`))

  console.log(pc.dim('refreshing materialized views...'))
  try { await refreshMaterializedViews(db) } catch {
    // CONCURRENTLY requires the view to be populated once; do a non-concurrent refresh first
    await db.execute(sql`REFRESH MATERIALIZED VIEW usage_daily`)
  }

  console.log(pc.green(`\n✓ backfill complete: ${totalEvents} events across ${allSessions.size} sessions`))
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}
```

- [ ] **Step 2: Write `apps/ingester/src/cli.ts`**

```ts
import 'dotenv/config'
import { config } from 'dotenv'
import { resolve } from 'node:path'
config({ path: resolve(process.cwd(), '../../.env.local') })

import { Command } from 'commander'
import { closeDb, getDb } from '@cca/db'
import { rollupSessions } from './writer/deriveSessions.js'
import { backfillAll } from './backfill/orchestrator.js'

const program = new Command()
program.name('cca-ingester').description('CCA ingester commands')

program
  .command('backfill')
  .description('Backfill all data under $CLAUDE_HOME (default: ~/.claude)')
  .option('--concurrency <n>', 'parallel file readers', '6')
  .action(async (opts) => {
    const home = process.env.CLAUDE_HOME ?? `${process.env.HOME}/.claude`
    await backfillAll(home, { concurrency: Number(opts.concurrency) })
    await closeDb()
  })

program
  .command('rebuild-derived')
  .description('Recompute derived tables (sessions) for all sessions in events')
  .action(async () => {
    const db = getDb()
    const rows = await db.execute<{ session_id: string }>(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { queryChunks: [], strings: ['SELECT DISTINCT session_id FROM events'] } as any,
    )
    const sessionIds = (rows as unknown as Array<{ session_id: string }>).map((r) => r.session_id)
    const batchSize = 500
    for (let i = 0; i < sessionIds.length; i += batchSize) {
      await rollupSessions(db, sessionIds.slice(i, i + batchSize))
    }
    console.log(`rebuilt ${sessionIds.length} sessions`)
    await closeDb()
  })

program.parseAsync().catch((e) => { console.error(e); process.exit(1) })
```

- [ ] **Step 3: Typecheck**

```bash
pnpm --filter @cca/ingester typecheck
```

- [ ] **Step 4: Commit**

```bash
git add apps/ingester/
git commit -m "feat(ingester): backfill orchestrator + CLI entry"
```

---

## Task 29: End-to-end backfill integration test

**Files:**
- Create: `apps/ingester/tests/integration.test.ts`
- Create: `apps/ingester/tests/fixtures/claude-home/` with synthetic data

- [ ] **Step 1: Create synthetic fixture layout**

Paths to create under `apps/ingester/tests/fixtures/claude-home/`:

- `projects/-Users-x-proj/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.jsonl`
- `projects/-Users-x-proj/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/subagents/agent-sub1.jsonl`
- `history.jsonl`
- `todos/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa-agent-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.json`

Content of the main transcript (one line each):
```
{"uuid":"e0000000-0000-0000-0000-000000000001","timestamp":"2026-04-01T00:00:00Z","type":"user","message":{"role":"user","content":"start"},"sessionId":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","cwd":"/Users/x/proj","version":"2.1.81","gitBranch":"main","entrypoint":"cli"}
{"uuid":"e0000000-0000-0000-0000-000000000002","timestamp":"2026-04-01T00:00:05Z","type":"assistant","message":{"role":"assistant","model":"claude-sonnet-4-6","content":[{"type":"text","text":"hello"}],"usage":{"input_tokens":100,"output_tokens":10,"cache_creation_input_tokens":0,"cache_read_input_tokens":0}},"sessionId":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","cwd":"/Users/x/proj","version":"2.1.81"}
```

Subagent file (one line):
```
{"uuid":"e0000000-0000-0000-0000-000000000010","timestamp":"2026-04-01T00:00:02Z","type":"user","message":{"role":"user","content":"sub task"},"sessionId":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","agentId":"sub1","cwd":"/Users/x/proj","version":"2.1.81"}
```

`history.jsonl`:
```
{"display":"start","pastedContents":{},"timestamp":1743465600000,"project":"/Users/x/proj"}
```

`todos/.../json`:
```
[]
```

- [ ] **Step 2: Write the integration test**

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { resolve } from 'node:path'
import { config } from 'dotenv'
config({ path: resolve(__dirname, '../../../.env.local') })

import postgres from 'postgres'
import { backfillAll } from '../src/backfill/orchestrator.js'
import { getDb, closeDb } from '@cca/db'

const TEST_URL = process.env.CCA_DATABASE_URL_TEST!
const FIXTURE_HOME = resolve(__dirname, 'fixtures/claude-home')

describe('end-to-end backfill', () => {
  const sql = postgres(TEST_URL, { max: 2 })
  beforeAll(async () => {
    process.env.CCA_DATABASE_URL = TEST_URL  // ensure getDb uses test DB
    for (const t of ['events','messages','tool_calls','sessions','prompts_history','todos','file_snapshots','shell_snapshots','_ingest_cursors']) {
      await sql.unsafe(`TRUNCATE ${t} RESTART IDENTITY CASCADE`)
    }
  })
  afterAll(async () => { await closeDb(); await sql.end() })

  it('ingests fixture home end-to-end', async () => {
    await backfillAll(FIXTURE_HOME, { concurrency: 2 })

    const events = await sql`SELECT COUNT(*) AS n FROM events`
    expect(Number(events[0]!.n)).toBeGreaterThanOrEqual(3)   // 2 main + 1 subagent

    const msgs = await sql`SELECT COUNT(*) AS n FROM messages`
    expect(Number(msgs[0]!.n)).toBeGreaterThanOrEqual(3)

    const sess = await sql`SELECT * FROM sessions WHERE session_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'`
    expect(sess).toHaveLength(1)
    expect(sess[0]?.subagent_count).toBeGreaterThanOrEqual(1)
    expect(sess[0]?.project_path).toBe('/Users/x/proj')
    expect(Number(sess[0]?.total_input_tokens)).toBe(100)

    const hist = await sql`SELECT COUNT(*) AS n FROM prompts_history`
    expect(Number(hist[0]!.n)).toBe(1)

    const cursors = await sql`SELECT COUNT(*) AS n FROM _ingest_cursors`
    expect(Number(cursors[0]!.n)).toBe(2)   // one per transcript file
  })

  it('is idempotent on re-run', async () => {
    const before = await sql`SELECT COUNT(*) AS n FROM events`
    await backfillAll(FIXTURE_HOME, { concurrency: 2 })
    const after = await sql`SELECT COUNT(*) AS n FROM events`
    expect(after[0]!.n).toEqual(before[0]!.n)
  })
})
```

- [ ] **Step 3: Run**

```bash
pnpm test -- integration
```
Expected: both tests PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/ingester/
git commit -m "test(ingester): end-to-end backfill integration with fixture home"
```

---

## Task 30: Run real backfill + smoke-check

**Files:** none created; this is a manual validation step documented in the plan.

- [ ] **Step 1: Make sure migrations + seed are applied to production DB**

```bash
pnpm db:migrate
pnpm db:seed
```

- [ ] **Step 2: Run the real backfill against `~/.claude`**

```bash
pnpm backfill
```
Expected: progress bar advances through ~3,184+ files; finishes in ~10–30 min; prints `✓ backfill complete: <N> events across <M> sessions`.

- [ ] **Step 3: Smoke-check the DB**

```bash
psql "$CCA_DATABASE_URL" <<'SQL'
SELECT COUNT(*) AS events,
       (SELECT COUNT(*) FROM sessions) AS sessions,
       (SELECT COUNT(*) FROM messages) AS messages,
       (SELECT COUNT(*) FROM tool_calls) AS tool_calls,
       (SELECT pg_size_pretty(pg_database_size('claude_code'))) AS db_size;
SELECT project_path, COUNT(*) AS sessions
  FROM sessions GROUP BY 1 ORDER BY 2 DESC LIMIT 10;
SELECT model, SUM(total_input_tokens) AS in_tok, SUM(total_output_tokens) AS out_tok, SUM(estimated_cost_usd) AS cost
  FROM sessions CROSS JOIN unnest(models_used) AS model
  GROUP BY 1 ORDER BY cost DESC NULLS LAST LIMIT 10;
SQL
```
Expected: sensible numbers — sessions count > 100, messages count > 10k, top projects reflect real work, cost totals non-zero.

- [ ] **Step 4: Commit a `STATUS.md` noting completion**

Create `STATUS.md`:
```markdown
# Status

## 2026-04-19 — Plan 1 (Foundation) complete

- `claude_code` DB in existing Supabase container
- All ~/.claude streams ingested end-to-end
- Event count: <fill in>
- Session count: <fill in>
- DB size: <fill in>

Next: Plan 2 — live capture (chokidar tailer + launchd) + CLI.
```

Then:
```bash
git add STATUS.md
git commit -m "chore: mark Plan 1 (Foundation) complete with smoke stats"
```

---

## Self-Review

**Spec coverage check** (mapping spec §11-sections → tasks):

- §2 Data inventory → Tasks 16–21 (parsers cover every source listed)
- §3 Architecture → implemented piece by piece; full system emerges in Task 28
- §4 Repo layout → Tasks 1–2
- §5 Data model → Tasks 6–8 (all tables), Task 11 (materialized view)
- §6 Components → ingester components in Tasks 22–28; CLI scaffolding in 28; web UI deferred to Plan 3
- §7 Ingest flow → §7.1 Backfill fully implemented in Tasks 26–30; §7.2 live tailer deferred to Plan 2; §7.3 hook registration deferred to Plan 2
- §8 Tech stack → Tasks 1, 2, 5
- §9 Redaction → Task 14 (render-layer use in Plan 3)
- §10 YAGNI → nothing to cover
- §11 Key decisions → implicit across implementation
- §12 Milestones → M1 Tasks 3–11, M2 Tasks 12–21, M3 Tasks 22–30 (matches scope of Plan 1)
- §13 Success criteria → backfill idempotence verified in Task 29, smoke checks in Task 30; real-time, UI, cost-accuracy-vs-ccusage criteria belong to later plans

**Placeholder scan:** No TBD/TODO markers found. Every code step includes the actual code. Commands show exact expected output.

**Type consistency check:**
- `ParsedEvent` defined in Task 15; used identically in Tasks 16, 17, 22, 23, 24.
- `DerivedMessage`/`DerivedToolCall`/`DerivedSession` defined in Task 15; derivations produce values matching these shapes (verified in tests 23, 24, 25).
- `TokenUsage`/`ModelPricing` in Task 13 are referenced only inside `packages/core` — no cross-package drift.
- Table names in tests (events, sessions, messages, tool_calls, prompts_history, todos, file_snapshots, shell_snapshots, model_pricing, _ingest_cursors) match Tasks 6, 7, 8 definitions.
- `ingestCursors` exported symbol name consistent (cursors.ts → schema/index.ts → used in orchestrator Task 28).

**Scope check:** This plan stops exactly at a working backfill pipeline. No live-capture, no CLI query commands, no web UI. That's intentional; those are Plan 2 and Plan 3.

No issues to fix.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-04-19-cca-foundation.md`.**

Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration. Best if you want a hands-off run with tight review loops.

**2. Inline Execution** — Execute tasks in this session using superpowers:executing-plans, batch execution with checkpoints for your review.

**Which approach?**
