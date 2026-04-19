# CCA Live Capture + CLI Implementation Plan (Plan 2 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Plan 1 backfill foundation into a live, always-on system: a daemon that tails `~/.claude` in real time, a hook relay that marks session liveness, and a `cca` CLI for interactive review from the terminal.

**Architecture:** One Node daemon process (managed by launchd) does three things: (a) watches the filesystem via chokidar, reads deltas from `_ingest_cursors`, and reuses Plan 1's writer pipeline; (b) serves a tiny HTTP API on `localhost:9939` for Claude Code hooks and SSE subscribers; (c) emits every new event onto an SSE stream. The `cca` CLI is a separate Node binary that issues SQL queries against the same Postgres DB and (for `tail --live`) subscribes to the SSE stream.

**Tech Stack:** chokidar 4, Node 22+ `http`, SSE (plain text/event-stream, no extra library), Commander 12 (already in deps), picocolors (already in deps), drizzle-orm (already), dayjs 1.11+ for `--since` parsing, launchd (macOS native). No new DB schema.

---

## Prerequisite state (at start of this plan)

- Plan 1 is merged to `main` at commit `ea7fc94`.
- The `claude_code` DB on `localhost:54322` is populated with ~300k events from backfill.
- `pnpm test` → 39/39 green.
- `apps/ingester` has `cli.ts` with `backfill` and `rebuild-derived` subcommands. You will EXTEND this CLI with a new `daemon` subcommand and add a separate `apps/cli` for user-facing commands (`cca`).
- `packages/db/src/schema/cursors.ts` already defines `_ingest_cursors` (sourceFile, byteOffset, updatedAt).
- The writer modules (`insertEventsBatch`, `deriveMessagesFromEvents`, `deriveToolCallsFromEvents`, `rollupSessions`) are in `apps/ingester/src/writer/`.
- Known deferred issues (documented in `STATUS.md`): unicode-escape crashes on 12 JSONL files; lossy path decoding; `fileParallelism: false` in vitest config.

## Working branch

Start Plan 2 on a new feature branch:
```bash
git checkout main
git checkout -b feat/plan-2-live-capture
```

---

## File Structure

```
ClaudeCode_Analytics/
├─ apps/
│  ├─ ingester/
│  │  └─ src/
│  │     ├─ daemon/
│  │     │  ├─ deltaReader.ts     # read lines added after a byte offset
│  │     │  ├─ broadcaster.ts     # pub/sub for SSE fanout
│  │     │  ├─ liveIngest.ts      # single-file delta pipeline (events + derive)
│  │     │  ├─ tailer.ts          # chokidar watcher + debounce + call liveIngest
│  │     │  ├─ server.ts          # http server: /status, /hook, /events
│  │     │  └─ index.ts           # daemon entry — wires tailer + server
│  │     └─ cli.ts                # MODIFY — add `daemon` subcommand
│  └─ cli/                        # NEW workspace — user-facing `cca` binary
│     ├─ src/
│     │  ├─ bin.ts                # commander entry, registers all commands
│     │  ├─ commands/
│     │  │  ├─ status.ts
│     │  │  ├─ sessions.ts
│     │  │  ├─ replay.ts
│     │  │  ├─ search.ts
│     │  │  ├─ stats.ts
│     │  │  ├─ tail.ts
│     │  │  └─ open.ts            # stub until Plan 3
│     │  └─ lib/
│     │     ├─ since.ts           # dayjs-based --since parser
│     │     └─ sse-client.ts      # EventSource-like consumer
│     ├─ tests/
│     │  └─ since.test.ts
│     ├─ package.json
│     └─ tsconfig.json
├─ infra/
│  ├─ hooks/
│  │  └─ cca-ping.sh              # NEW — invoked by CC hooks
│  └─ launchd/
│     └─ com.aporb.cca.ingester.plist
└─ scripts/
   ├─ install-daemon.sh           # copy plist, load, start
   ├─ uninstall-daemon.sh         # stop, unload, remove plist
   ├─ install-hooks.sh            # patch ~/.claude/settings.json
   └─ uninstall-hooks.sh          # revert ~/.claude/settings.json
```

New workspace package: `apps/cli` (name `@cca/cli`, binary `cca`). Depends on `@cca/core`, `@cca/db`.

---

## Phase A — Live Tailer

### Task 1: Add chokidar dependency

**Files:**
- Modify: `apps/ingester/package.json`

- [ ] **Step 1: Add chokidar**

Edit `apps/ingester/package.json`. In `dependencies`, add `"chokidar": "4.0.1"`. Keep the pre-existing entries (`@cca/core`, `@cca/db`, `@cca/parsers`, `@clack/prompts`, `cli-progress`, `commander`, `p-limit`, `picocolors`).

- [ ] **Step 2: Install**

```bash
cd /Users/amynporb/Documents/_Projects/ClaudeCode_Analytics
pnpm install
```

Expected: clean install, no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/ingester/package.json pnpm-lock.yaml
git commit -m "chore(ingester): add chokidar 4 for file watching"
```

---

### Task 2: Delta-reader utility

**Files:**
- Create: `apps/ingester/src/daemon/deltaReader.ts`
- Create: `apps/ingester/tests/daemon.deltaReader.test.ts`

Thin wrapper over `readJsonlLines` from `@cca/parsers` that yields every line after a byte offset, tracking cumulative offset. The tailer will use this to resume from the persisted cursor.

- [ ] **Step 1: Write failing test** at `apps/ingester/tests/daemon.deltaReader.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { mkdtempSync, writeFileSync, appendFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readDelta } from '../src/daemon/deltaReader.js'

describe('readDelta', () => {
  it('reads lines added since the given byte offset', async () => {
    const root = mkdtempSync(join(tmpdir(), 'cca-delta-'))
    const file = join(root, 't.jsonl')
    writeFileSync(file, '{"a":1}\n{"a":2}\n')
    const initialOffset = Buffer.byteLength('{"a":1}\n', 'utf8')
    appendFileSync(file, '{"a":3}\n')
    const out: unknown[] = []
    for await (const { value } of readDelta(file, initialOffset)) out.push(value)
    expect(out).toEqual([{ a: 2 }, { a: 3 }])
  })

  it('returns nothing when offset is at EOF', async () => {
    const root = mkdtempSync(join(tmpdir(), 'cca-delta-'))
    const file = join(root, 't.jsonl')
    writeFileSync(file, '{"a":1}\n')
    const eof = Buffer.byteLength('{"a":1}\n', 'utf8')
    const out: unknown[] = []
    for await (const { value } of readDelta(file, eof)) out.push(value)
    expect(out).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run — expect failure**

```bash
pnpm test -- deltaReader
```

Expected: test suite fails to load (module missing).

- [ ] **Step 3: Write implementation** at `apps/ingester/src/daemon/deltaReader.ts`

```ts
import { readJsonlLines } from '@cca/parsers'

export interface DeltaLine {
  value: unknown
  byteOffset: number
  raw: string
  error?: Error
}

export async function* readDelta(
  file: string,
  startOffset: number,
): AsyncGenerator<DeltaLine> {
  for await (const item of readJsonlLines(file, { startOffset })) {
    yield {
      value: item.value,
      raw: item.raw,
      byteOffset: item.byteOffset,
      ...(item.error !== undefined ? { error: item.error } : {}),
    }
  }
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
pnpm test -- deltaReader
```

Expected: 2/2 pass.

- [ ] **Step 5: Commit**

```bash
git add apps/ingester/
git commit -m "feat(ingester): delta reader that resumes from a byte offset"
```

---

### Task 3: Broadcaster (SSE fanout)

**Files:**
- Create: `apps/ingester/src/daemon/broadcaster.ts`
- Create: `apps/ingester/tests/daemon.broadcaster.test.ts`

A tiny pub/sub. Multiple subscribers; each subscriber is a callback invoked with a `BroadcastEvent`.

- [ ] **Step 1: Write failing test** at `apps/ingester/tests/daemon.broadcaster.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { Broadcaster } from '../src/daemon/broadcaster.js'

describe('Broadcaster', () => {
  it('delivers events to all subscribers', () => {
    const b = new Broadcaster()
    const a: unknown[] = []
    const x: unknown[] = []
    const unsubA = b.subscribe((e) => a.push(e))
    b.subscribe((e) => x.push(e))
    b.publish({ kind: 'event', payload: { uuid: '1' } })
    b.publish({ kind: 'status', payload: { session: 's', status: 'active' } })
    expect(a).toHaveLength(2)
    expect(x).toHaveLength(2)
    unsubA()
    b.publish({ kind: 'event', payload: { uuid: '2' } })
    expect(a).toHaveLength(2)
    expect(x).toHaveLength(3)
  })

  it('isolates subscriber errors', () => {
    const b = new Broadcaster()
    b.subscribe(() => { throw new Error('boom') })
    const good: unknown[] = []
    b.subscribe((e) => good.push(e))
    expect(() => b.publish({ kind: 'event', payload: { n: 1 } })).not.toThrow()
    expect(good).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run — expect failure**

```bash
pnpm test -- broadcaster
```

- [ ] **Step 3: Write implementation** at `apps/ingester/src/daemon/broadcaster.ts`

```ts
export interface BroadcastEvent {
  kind: 'event' | 'status' | 'heartbeat'
  payload: unknown
}

export type Subscriber = (event: BroadcastEvent) => void

export class Broadcaster {
  #subscribers = new Set<Subscriber>()

  subscribe(fn: Subscriber): () => void {
    this.#subscribers.add(fn)
    return () => this.#subscribers.delete(fn)
  }

  publish(event: BroadcastEvent): void {
    for (const fn of this.#subscribers) {
      try { fn(event) } catch (e) {
        console.error('broadcaster subscriber error:', e)
      }
    }
  }

  get size(): number { return this.#subscribers.size }
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
pnpm test -- broadcaster
```

- [ ] **Step 5: Commit**

```bash
git add apps/ingester/
git commit -m "feat(ingester): Broadcaster pub/sub for daemon events"
```

---

### Task 4: Single-file delta pipeline

**Files:**
- Create: `apps/ingester/src/daemon/liveIngest.ts`
- Create: `apps/ingester/tests/daemon.liveIngest.test.ts`

The function called by the watcher when a transcript file changes. Reads the whole file, upserts events + derived messages + tool_calls, updates the cursor, rolls up the touched session, publishes each new event to the broadcaster.

Note: the ingester reads the whole file rather than only the delta. Parsing is cheap; dedup is handled by `ON CONFLICT DO NOTHING` on event UUID. The cursor serves only as a skip-if-no-new-bytes optimization. This matches the backfiller's semantics and keeps the code simple.

- [ ] **Step 1: Write failing integration test** at `apps/ingester/tests/daemon.liveIngest.test.ts`

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { config } from 'dotenv'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdtempSync, writeFileSync, appendFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
const __dirname = dirname(fileURLToPath(import.meta.url))
config({ path: resolve(__dirname, '../../../.env.local') })

import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import * as schema from '@cca/db/schema'
import { Broadcaster } from '../src/daemon/broadcaster.js'
import { ingestFileDelta } from '../src/daemon/liveIngest.js'

const TEST_URL = process.env.CCA_DATABASE_URL_TEST!
const sql = postgres(TEST_URL, { max: 2 })
const db = drizzle(sql, { schema })

describe('ingestFileDelta', () => {
  beforeAll(async () => {
    await sql`DELETE FROM events WHERE session_id = 'live-test'`
    await sql`DELETE FROM _ingest_cursors WHERE source_file LIKE '%cca-live-%'`
  })
  afterAll(async () => { await sql.end() })

  it('ingests new lines appended to a file since last cursor', async () => {
    const root = mkdtempSync(resolve(tmpdir(), 'cca-live-'))
    const file = resolve(root, 's.jsonl')
    writeFileSync(file,
      `{"uuid":"e0000000-0000-0000-0000-000000000200","type":"user","timestamp":"2026-04-01T00:00:00Z","sessionId":"live-test","message":{"role":"user","content":"hi"}}\n`
    )

    const broadcaster = new Broadcaster()
    const seen: unknown[] = []
    broadcaster.subscribe((e) => seen.push(e))

    const r1 = await ingestFileDelta(db, file, broadcaster)
    expect(r1.newEvents).toBe(1)
    expect(r1.sessionIds).toContain('live-test')

    appendFileSync(file,
      `{"uuid":"e0000000-0000-0000-0000-000000000201","type":"assistant","timestamp":"2026-04-01T00:00:01Z","sessionId":"live-test","message":{"role":"assistant","model":"claude-sonnet-4-6","content":[{"type":"text","text":"hello"}],"usage":{"input_tokens":5,"output_tokens":2,"cache_creation_input_tokens":0,"cache_read_input_tokens":0}}}\n`
    )

    const r2 = await ingestFileDelta(db, file, broadcaster)
    expect(r2.newEvents).toBe(1)

    const rows = await sql`SELECT COUNT(*) AS n FROM events WHERE session_id = 'live-test'`
    expect(Number(rows[0]!.n)).toBe(2)
    expect(seen.filter((e: any) => e.kind === 'event')).toHaveLength(2)
  })

  it('is a no-op when called again without new data', async () => {
    const root = mkdtempSync(resolve(tmpdir(), 'cca-live-noop-'))
    const file = resolve(root, 's.jsonl')
    writeFileSync(file,
      `{"uuid":"e0000000-0000-0000-0000-000000000210","type":"user","timestamp":"2026-04-01T00:00:00Z","sessionId":"live-test","message":{"role":"user","content":"x"}}\n`
    )
    const bc = new Broadcaster()
    await ingestFileDelta(db, file, bc)
    const again = await ingestFileDelta(db, file, bc)
    expect(again.newEvents).toBe(0)
  })
})
```

- [ ] **Step 2: Run — expect failure**

```bash
pnpm test -- daemon.liveIngest
```

- [ ] **Step 3: Write implementation** at `apps/ingester/src/daemon/liveIngest.ts`

```ts
import { statSync } from 'node:fs'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { eq, sql } from 'drizzle-orm'
import { readTranscript } from '@cca/parsers'
import type { ParsedEvent } from '@cca/core'
import { ingestCursors } from '@cca/db'
import type * as schema from '@cca/db/schema'
import { insertEventsBatch } from '../writer/events.js'
import { deriveMessagesFromEvents } from '../writer/deriveMessages.js'
import { deriveToolCallsFromEvents } from '../writer/deriveToolCalls.js'
import { rollupSessions } from '../writer/deriveSessions.js'
import type { Broadcaster } from './broadcaster.js'

type Db = PostgresJsDatabase<typeof schema>

export interface DeltaResult {
  newEvents: number
  sessionIds: Set<string>
  fromOffset: number
  toOffset: number
}

export async function ingestFileDelta(
  db: Db,
  file: string,
  broadcaster: Broadcaster,
): Promise<DeltaResult> {
  const existing = await db
    .select({ byteOffset: ingestCursors.byteOffset })
    .from(ingestCursors)
    .where(eq(ingestCursors.sourceFile, file))
    .limit(1)
  const fromOffset = existing[0]?.byteOffset ?? 0
  const fileSize = statSync(file).size
  if (fileSize <= fromOffset) {
    return { newEvents: 0, sessionIds: new Set(), fromOffset, toOffset: fromOffset }
  }

  const batch: ParsedEvent[] = []
  const sessionIds = new Set<string>()
  for await (const e of readTranscript(file)) {
    batch.push(e)
    sessionIds.add(e.sessionId)
  }

  const inserted = await insertEventsBatch(db, batch)
  if (inserted > 0) {
    await deriveMessagesFromEvents(db, batch)
    await deriveToolCallsFromEvents(db, batch)
    await rollupSessions(db, [...sessionIds])
    for (const e of batch) broadcaster.publish({
      kind: 'event',
      payload: { uuid: e.uuid, sessionId: e.sessionId, type: e.type, subtype: e.subtype, timestamp: e.timestamp },
    })
  }

  await db
    .insert(ingestCursors)
    .values({ sourceFile: file, byteOffset: fileSize })
    .onConflictDoUpdate({
      target: ingestCursors.sourceFile,
      set: { byteOffset: fileSize, updatedAt: sql`now()` },
    })

  return { newEvents: inserted, sessionIds, fromOffset, toOffset: fileSize }
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
pnpm test -- daemon.liveIngest
```

- [ ] **Step 5: Commit**

```bash
git add apps/ingester/
git commit -m "feat(ingester): single-file delta ingest with broadcaster publish"
```

---

### Task 5: Chokidar tailer

**Files:**
- Create: `apps/ingester/src/daemon/tailer.ts`
- Create: `apps/ingester/tests/daemon.tailer.test.ts`

Wraps chokidar to watch `~/.claude/projects/**/*.jsonl` and call `ingestFileDelta` on every change. Per-file debounce prevents flooding when CC writes many events quickly.

- [ ] **Step 1: Write failing test** at `apps/ingester/tests/daemon.tailer.test.ts`

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { config } from 'dotenv'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdtempSync, writeFileSync, appendFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
const __dirname = dirname(fileURLToPath(import.meta.url))
config({ path: resolve(__dirname, '../../../.env.local') })

import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import * as schema from '@cca/db/schema'
import { Broadcaster } from '../src/daemon/broadcaster.js'
import { startTailer } from '../src/daemon/tailer.js'

const TEST_URL = process.env.CCA_DATABASE_URL_TEST!
const sql = postgres(TEST_URL, { max: 2 })
const db = drizzle(sql, { schema })

describe('tailer', () => {
  beforeAll(async () => {
    await sql`DELETE FROM events WHERE session_id = 'tail-test'`
    await sql`DELETE FROM _ingest_cursors WHERE source_file LIKE '%cca-tailer-%'`
  })
  afterAll(async () => { await sql.end() })

  it('detects new lines appended to a watched JSONL file', async () => {
    const root = mkdtempSync(resolve(tmpdir(), 'cca-tailer-'))
    mkdirSync(resolve(root, 'projects/-x'), { recursive: true })
    const file = resolve(root, 'projects/-x/session.jsonl')
    writeFileSync(file, '')

    const bc = new Broadcaster()
    const seen: unknown[] = []
    bc.subscribe((e) => { if (e.kind === 'event') seen.push(e.payload) })

    const tailer = await startTailer({ claudeHome: root, db, broadcaster: bc, debounceMs: 50 })

    appendFileSync(file,
      `{"uuid":"e0000000-0000-0000-0000-000000000300","type":"user","timestamp":"2026-04-01T00:00:00Z","sessionId":"tail-test","message":{"role":"user","content":"live"}}\n`
    )
    await new Promise((r) => setTimeout(r, 500))

    const rows = await sql`SELECT COUNT(*) AS n FROM events WHERE session_id = 'tail-test'`
    expect(Number(rows[0]!.n)).toBe(1)
    expect(seen).toHaveLength(1)

    await tailer.stop()
  })
})
```

- [ ] **Step 2: Run — expect failure**

```bash
pnpm test -- daemon.tailer
```

- [ ] **Step 3: Write implementation** at `apps/ingester/src/daemon/tailer.ts`

```ts
import chokidar, { type FSWatcher } from 'chokidar'
import { join } from 'node:path'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type * as schema from '@cca/db/schema'
import { ingestFileDelta } from './liveIngest.js'
import type { Broadcaster } from './broadcaster.js'

type Db = PostgresJsDatabase<typeof schema>

export interface TailerOptions {
  claudeHome: string
  db: Db
  broadcaster: Broadcaster
  debounceMs?: number
}

export interface Tailer {
  stop: () => Promise<void>
}

export async function startTailer(opts: TailerOptions): Promise<Tailer> {
  const debounceMs = opts.debounceMs ?? 200
  const pending = new Map<string, NodeJS.Timeout>()

  const watcher: FSWatcher = chokidar.watch(
    [join(opts.claudeHome, 'projects/**/*.jsonl')],
    {
      ignoreInitial: false,
      awaitWriteFinish: false,
      persistent: true,
      usePolling: false,
    },
  )

  const handle = (file: string) => {
    const existing = pending.get(file)
    if (existing) clearTimeout(existing)
    pending.set(file, setTimeout(async () => {
      pending.delete(file)
      try {
        await ingestFileDelta(opts.db, file, opts.broadcaster)
      } catch (e) {
        console.error(`tailer: failed to ingest ${file}: ${(e as Error).message}`)
      }
    }, debounceMs))
  }

  watcher.on('add', handle)
  watcher.on('change', handle)
  watcher.on('error', (e) => console.error('tailer error:', e))

  await new Promise<void>((resolve) => watcher.once('ready', resolve))

  return {
    async stop() {
      for (const t of pending.values()) clearTimeout(t)
      pending.clear()
      await watcher.close()
    },
  }
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
pnpm test -- daemon.tailer
```

Expected: 1/1 pass. The test may take ~600ms due to the sleep.

- [ ] **Step 5: Commit**

```bash
git add apps/ingester/
git commit -m "feat(ingester): chokidar tailer with per-file debounce"
```

---

## Phase B — Hook Relay HTTP Server

### Task 6: HTTP server with /status, /hook, /events

**Files:**
- Create: `apps/ingester/src/daemon/server.ts`
- Create: `apps/ingester/tests/daemon.server.test.ts`

`GET /status` → JSON health. `POST /hook` → update `sessions.status`, republish to broadcaster. `GET /events` → SSE stream.

- [ ] **Step 1: Write failing test** at `apps/ingester/tests/daemon.server.test.ts`

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { config } from 'dotenv'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
const __dirname = dirname(fileURLToPath(import.meta.url))
config({ path: resolve(__dirname, '../../../.env.local') })

import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import * as schema from '@cca/db/schema'
import { Broadcaster } from '../src/daemon/broadcaster.js'
import { startServer } from '../src/daemon/server.js'

const TEST_URL = process.env.CCA_DATABASE_URL_TEST!
const sql = postgres(TEST_URL, { max: 2 })
const db = drizzle(sql, { schema })
const PORT = 19939

describe('daemon server', () => {
  let stop: () => Promise<void>
  const bc = new Broadcaster()

  beforeAll(async () => {
    await sql`INSERT INTO sessions (session_id, status) VALUES ('hook-test', NULL) ON CONFLICT (session_id) DO UPDATE SET status = NULL`
    const s = await startServer({ port: PORT, db, broadcaster: bc, startedAt: Date.now() })
    stop = s.stop
  })
  afterAll(async () => { await stop(); await sql.end() })

  it('GET /status returns JSON', async () => {
    const res = await fetch(`http://localhost:${PORT}/status`)
    expect(res.status).toBe(200)
    const body = await res.json() as { ok: boolean; uptimeSec: number; subscribers: number }
    expect(body.ok).toBe(true)
    expect(typeof body.uptimeSec).toBe('number')
  })

  it('POST /hook updates session status and republishes', async () => {
    const seen: unknown[] = []
    const unsub = bc.subscribe((e) => { if (e.kind === 'status') seen.push(e.payload) })
    const res = await fetch(`http://localhost:${PORT}/hook`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId: 'hook-test', event: 'SessionStart' }),
    })
    expect(res.status).toBe(204)
    const rows = await sql`SELECT status FROM sessions WHERE session_id = 'hook-test'`
    expect(rows[0]?.status).toBe('active')
    expect(seen).toHaveLength(1)
    unsub()
  })

  it('POST /hook with SessionEnd marks ended', async () => {
    await fetch(`http://localhost:${PORT}/hook`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId: 'hook-test', event: 'SessionEnd' }),
    })
    const rows = await sql`SELECT status FROM sessions WHERE session_id = 'hook-test'`
    expect(rows[0]?.status).toBe('ended')
  })

  it('GET /events streams server-sent events', async () => {
    const controller = new AbortController()
    const res = await fetch(`http://localhost:${PORT}/events`, { signal: controller.signal })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/event-stream')

    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    setTimeout(() => bc.publish({ kind: 'event', payload: { uuid: 't' } }), 50)
    const { value } = await reader.read()
    const text = decoder.decode(value)
    expect(text).toMatch(/event: (event|heartbeat)/)
    controller.abort()
  })
})
```

- [ ] **Step 2: Run — expect failure**

```bash
pnpm test -- daemon.server
```

- [ ] **Step 3: Write implementation** at `apps/ingester/src/daemon/server.ts`

```ts
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { sql } from 'drizzle-orm'
import { sessions } from '@cca/db'
import type * as schema from '@cca/db/schema'
import type { Broadcaster, BroadcastEvent } from './broadcaster.js'

type Db = PostgresJsDatabase<typeof schema>

export interface ServerOptions {
  port: number
  db: Db
  broadcaster: Broadcaster
  startedAt: number
}

export interface RunningServer {
  stop: () => Promise<void>
}

async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  for await (const c of req) chunks.push(c as Buffer)
  const raw = Buffer.concat(chunks).toString('utf8')
  if (!raw) return {}
  try { return JSON.parse(raw) as Record<string, unknown> } catch { return {} }
}

function writeJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(body))
}

export async function startServer(opts: ServerOptions): Promise<RunningServer> {
  let lastEventAt: number | null = null
  opts.broadcaster.subscribe(() => { lastEventAt = Date.now() })

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://localhost:${opts.port}`)
    if (req.method === 'GET' && url.pathname === '/status') {
      writeJson(res, 200, {
        ok: true,
        uptimeSec: Math.round((Date.now() - opts.startedAt) / 1000),
        subscribers: opts.broadcaster.size,
        lastEventAt: lastEventAt ? new Date(lastEventAt).toISOString() : null,
      })
      return
    }

    if (req.method === 'POST' && url.pathname === '/hook') {
      const body = await readJsonBody(req)
      const sessionId = typeof body.sessionId === 'string' ? body.sessionId : null
      const event = typeof body.event === 'string' ? body.event : null
      if (!sessionId || !event) {
        writeJson(res, 400, { error: 'sessionId and event required' })
        return
      }
      const status = event === 'SessionStart' ? 'active'
        : event === 'SessionEnd' || event === 'Stop' ? 'ended'
        : null
      if (status) {
        await opts.db
          .insert(sessions)
          .values({ sessionId, status })
          .onConflictDoUpdate({
            target: sessions.sessionId,
            set: { status: sql`EXCLUDED.status` },
          })
      }
      opts.broadcaster.publish({ kind: 'status', payload: { sessionId, event, status } })
      res.writeHead(204); res.end()
      return
    }

    if (req.method === 'GET' && url.pathname === '/events') {
      res.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        'connection': 'keep-alive',
      })
      const write = (e: BroadcastEvent) => {
        res.write(`event: ${e.kind}\ndata: ${JSON.stringify(e.payload)}\n\n`)
      }
      res.write(`event: heartbeat\ndata: {}\n\n`)
      const unsub = opts.broadcaster.subscribe(write)
      req.on('close', () => unsub())
      return
    }

    res.writeHead(404); res.end()
  })

  await new Promise<void>((resolve) => server.listen(opts.port, 'localhost', resolve))

  return {
    async stop() {
      await new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      )
    },
  }
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
pnpm test -- daemon.server
```

Expected: 4/4 pass.

- [ ] **Step 5: Commit**

```bash
git add apps/ingester/
git commit -m "feat(ingester): HTTP server with /status, /hook, /events (SSE)"
```

---

### Task 7: Daemon entry — wire tailer + server

**Files:**
- Create: `apps/ingester/src/daemon/index.ts`
- Modify: `apps/ingester/src/cli.ts` (add `daemon` subcommand)

- [ ] **Step 1: Write `apps/ingester/src/daemon/index.ts`**

```ts
import { getDb, closeDb } from '@cca/db'
import { Broadcaster } from './broadcaster.js'
import { startTailer } from './tailer.js'
import { startServer } from './server.js'
import pc from 'picocolors'

export interface DaemonOptions {
  claudeHome: string
  port?: number
}

export interface Daemon {
  stop: () => Promise<void>
}

export async function startDaemon(opts: DaemonOptions): Promise<Daemon> {
  const db = getDb()
  const broadcaster = new Broadcaster()
  const startedAt = Date.now()
  const port = opts.port ?? 9939

  console.log(pc.dim(`[cca daemon] starting at ${new Date(startedAt).toISOString()}`))
  console.log(pc.dim(`[cca daemon] watching ${opts.claudeHome}`))
  console.log(pc.dim(`[cca daemon] http on http://localhost:${port}`))

  const tailer = await startTailer({ claudeHome: opts.claudeHome, db, broadcaster })
  const server = await startServer({ port, db, broadcaster, startedAt })

  const shutdown = async () => {
    console.log(pc.dim('[cca daemon] shutting down...'))
    await tailer.stop()
    await server.stop()
    await closeDb()
  }

  process.on('SIGINT', async () => { await shutdown(); process.exit(0) })
  process.on('SIGTERM', async () => { await shutdown(); process.exit(0) })

  console.log(pc.green('[cca daemon] ready'))
  return { stop: shutdown }
}
```

- [ ] **Step 2: Add `daemon` subcommand to `apps/ingester/src/cli.ts`**

Preserve the existing imports and `backfill`/`rebuild-derived` commands. Add import:

```ts
import { startDaemon } from './daemon/index.js'
```

Then add the subcommand before `program.parseAsync()`:

```ts
program
  .command('daemon')
  .description('Run the live tailer + hook relay daemon')
  .option('--port <n>', 'HTTP port for hook relay + SSE', '9939')
  .action(async (opts) => {
    const home = process.env.CLAUDE_HOME ?? `${process.env.HOME}/.claude`
    await startDaemon({ claudeHome: home, port: Number(opts.port) })
  })
```

- [ ] **Step 3: Typecheck**

```bash
pnpm --filter @cca/ingester typecheck
```

Expected: exit 0.

- [ ] **Step 4: Smoke-start the daemon manually**

```bash
set -a && source .env.local && set +a
pnpm --filter @cca/ingester run rebuild-derived >/dev/null 2>&1 || true  # warm connection
# Start in background on a test port
( pnpm --filter @cca/ingester exec tsx src/cli.ts daemon --port 19940 ) &
DAEMON_PID=$!
sleep 2
curl -s http://localhost:19940/status | jq .
kill -TERM $DAEMON_PID
wait $DAEMON_PID 2>/dev/null
```

Expected: status returns `{"ok":true,"uptimeSec":...,"subscribers":0,"lastEventAt":null}`; daemon shuts down cleanly.

- [ ] **Step 5: Commit**

```bash
git add apps/ingester/
git commit -m "feat(ingester): daemon entry wires tailer + server + CLI subcommand"
```

---

## Phase C — Hook Scripts + Daemon Install

### Task 8: Hook ping script

**Files:**
- Create: `infra/hooks/cca-ping.sh`

Runs on every hook fire. Reads hook JSON from stdin (CC convention), extracts `sessionId`, POSTs to the daemon. Curl has `--max-time 1` and `|| true` so it never blocks CC.

- [ ] **Step 1: Write `infra/hooks/cca-ping.sh`**

```bash
#!/usr/bin/env bash
set -u
EVENT="${1:-unknown}"
PAYLOAD="$(cat -)"

SESSION_ID="$(printf '%s' "$PAYLOAD" | jq -r '.session_id // .sessionId // empty' 2>/dev/null)"
if [ -z "$SESSION_ID" ]; then
  SESSION_ID="${CLAUDE_SESSION_ID:-}"
fi

if [ -n "$SESSION_ID" ]; then
  curl --silent --show-error --max-time 1 \
    -X POST http://localhost:9939/hook \
    -H 'content-type: application/json' \
    -d "$(jq -n --arg s "$SESSION_ID" --arg e "$EVENT" --arg t "$(date -u +%Y-%m-%dT%H:%M:%S%z)" \
      '{sessionId: $s, event: $e, timestamp: $t}')" \
    >/dev/null 2>&1 || true
fi

exit 0
```

- [ ] **Step 2: Make executable**

```bash
chmod +x infra/hooks/cca-ping.sh
```

- [ ] **Step 3: Smoke-test against a running daemon**

```bash
set -a && source .env.local && set +a
( pnpm --filter @cca/ingester exec tsx src/cli.ts daemon --port 19941 ) &
DAEMON_PID=$!
sleep 1

psql "$CCA_DATABASE_URL" -c "INSERT INTO sessions (session_id) VALUES ('ping-test-1') ON CONFLICT DO NOTHING"

# Temporarily swap port for test
sed -i.bak 's|http://localhost:9939/hook|http://localhost:19941/hook|' infra/hooks/cca-ping.sh
echo '{"session_id":"ping-test-1"}' | bash infra/hooks/cca-ping.sh SessionStart
sleep 1
psql "$CCA_DATABASE_URL" -tAc "SELECT status FROM sessions WHERE session_id = 'ping-test-1'"
# Expected: active
mv infra/hooks/cca-ping.sh.bak infra/hooks/cca-ping.sh

kill -TERM $DAEMON_PID
wait $DAEMON_PID 2>/dev/null
```

Expected: psql prints `active`.

- [ ] **Step 4: Commit**

```bash
git add infra/hooks/
git commit -m "feat(hooks): cca-ping.sh bash helper invoked by CC hooks"
```

---

### Task 9: Install / uninstall hook scripts

**Files:**
- Create: `scripts/install-hooks.sh`
- Create: `scripts/uninstall-hooks.sh`

Copy `cca-ping.sh` to `~/.claude/hooks/` and patch `~/.claude/settings.json` via `jq` (so we don't clobber the user's existing rtk hook).

- [ ] **Step 1: Write `scripts/install-hooks.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail

CLAUDE_HOME="${CLAUDE_HOME:-$HOME/.claude}"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

mkdir -p "$CLAUDE_HOME/hooks"
cp "$REPO_ROOT/infra/hooks/cca-ping.sh" "$CLAUDE_HOME/hooks/cca-ping.sh"
chmod +x "$CLAUDE_HOME/hooks/cca-ping.sh"

SETTINGS="$CLAUDE_HOME/settings.json"
if [ ! -f "$SETTINGS" ]; then
  echo '{"hooks":{}}' > "$SETTINGS"
fi

TMP="$(mktemp)"
jq --arg script "$CLAUDE_HOME/hooks/cca-ping.sh" '
  .hooks //= {}
  | .hooks.SessionStart = (
      (.hooks.SessionStart // [])
      | map(select(.hooks[]?.command | test("cca-ping.sh") | not))
      + [{hooks: [{type: "command", command: ($script + " SessionStart")}]}]
    )
  | .hooks.SessionEnd = (
      (.hooks.SessionEnd // [])
      | map(select(.hooks[]?.command | test("cca-ping.sh") | not))
      + [{hooks: [{type: "command", command: ($script + " SessionEnd")}]}]
    )
  | .hooks.Stop = (
      (.hooks.Stop // [])
      | map(select(.hooks[]?.command | test("cca-ping.sh") | not))
      + [{hooks: [{type: "command", command: ($script + " Stop")}]}]
    )
' "$SETTINGS" > "$TMP"
mv "$TMP" "$SETTINGS"

echo "✓ installed cca-ping.sh and registered hooks in $SETTINGS"
```

- [ ] **Step 2: Write `scripts/uninstall-hooks.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail

CLAUDE_HOME="${CLAUDE_HOME:-$HOME/.claude}"
SETTINGS="$CLAUDE_HOME/settings.json"

if [ -f "$SETTINGS" ]; then
  TMP="$(mktemp)"
  jq '
    .hooks.SessionStart = ((.hooks.SessionStart // []) | map(select(.hooks[]?.command | test("cca-ping.sh") | not)))
    | .hooks.SessionEnd = ((.hooks.SessionEnd // []) | map(select(.hooks[]?.command | test("cca-ping.sh") | not)))
    | .hooks.Stop = ((.hooks.Stop // []) | map(select(.hooks[]?.command | test("cca-ping.sh") | not)))
  ' "$SETTINGS" > "$TMP"
  mv "$TMP" "$SETTINGS"
fi

rm -f "$CLAUDE_HOME/hooks/cca-ping.sh"
echo "✓ removed cca-ping.sh hook from $SETTINGS"
```

- [ ] **Step 3: Make both executable, dry-run test**

```bash
chmod +x scripts/install-hooks.sh scripts/uninstall-hooks.sh

TEST_HOME=$(mktemp -d)
CLAUDE_HOME="$TEST_HOME" bash scripts/install-hooks.sh
cat "$TEST_HOME/settings.json" | jq '.hooks | keys'
# Expected: ["SessionEnd","SessionStart","Stop"]

CLAUDE_HOME="$TEST_HOME" bash scripts/uninstall-hooks.sh
cat "$TEST_HOME/settings.json" | jq '.hooks'
# Expected: all three arrays empty

rm -rf "$TEST_HOME"
```

- [ ] **Step 4: Commit**

```bash
git add scripts/install-hooks.sh scripts/uninstall-hooks.sh
git commit -m "feat(hooks): install/uninstall scripts that patch ~/.claude/settings.json"
```

---

### Task 10: launchd plist + daemon install scripts

**Files:**
- Create: `infra/launchd/com.aporb.cca.ingester.plist`
- Create: `scripts/install-daemon.sh`
- Create: `scripts/uninstall-daemon.sh`

- [ ] **Step 1: Write `infra/launchd/com.aporb.cca.ingester.plist`**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.aporb.cca.ingester</string>
    <key>ProgramArguments</key>
    <array>
        <string>__WRAPPER__</string>
    </array>
    <key>WorkingDirectory</key>
    <string>__REPO_ROOT__</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
        <key>HOME</key>
        <string>__HOME__</string>
    </dict>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>__HOME__/Library/Logs/cca/daemon.log</string>
    <key>StandardErrorPath</key>
    <string>__HOME__/Library/Logs/cca/daemon.err.log</string>
</dict>
</plist>
```

- [ ] **Step 2: Write `scripts/install-daemon.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LABEL="com.aporb.cca.ingester"
PLIST_SRC="$REPO_ROOT/infra/launchd/$LABEL.plist"
PLIST_DST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG_DIR="$HOME/Library/Logs/cca"
WRAPPER="$REPO_ROOT/scripts/run-daemon.sh"

mkdir -p "$(dirname "$PLIST_DST")" "$LOG_DIR"

cat > "$WRAPPER" <<EOF
#!/usr/bin/env bash
set -euo pipefail
cd "$REPO_ROOT"
[ -f .env.local ] && set -a && . ./.env.local && set +a
/opt/homebrew/bin/pnpm --filter @cca/ingester exec tsx src/cli.ts daemon
EOF
chmod +x "$WRAPPER"

sed -e "s|__WRAPPER__|$WRAPPER|" \
    -e "s|__REPO_ROOT__|$REPO_ROOT|" \
    -e "s|__HOME__|$HOME|g" \
    "$PLIST_SRC" > "$PLIST_DST"

launchctl unload "$PLIST_DST" >/dev/null 2>&1 || true
launchctl load "$PLIST_DST"
echo "✓ daemon installed. Logs at $LOG_DIR"
echo "  check with: launchctl list | grep $LABEL"
echo "  and: curl http://localhost:9939/status"
```

- [ ] **Step 3: Write `scripts/uninstall-daemon.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail

LABEL="com.aporb.cca.ingester"
PLIST_DST="$HOME/Library/LaunchAgents/$LABEL.plist"

launchctl unload "$PLIST_DST" 2>/dev/null || true
rm -f "$PLIST_DST"
rm -f "$(cd "$(dirname "$0")" && pwd)/run-daemon.sh"
echo "✓ daemon uninstalled"
```

- [ ] **Step 4: Make executable + install + verify**

```bash
chmod +x scripts/install-daemon.sh scripts/uninstall-daemon.sh
bash scripts/install-daemon.sh
sleep 3
curl -s http://localhost:9939/status | jq .
launchctl list | grep com.aporb.cca.ingester
```

Expected: daemon listed with PID; status returns `{ok:true,...}`.

- [ ] **Step 5: Commit**

```bash
git add infra/launchd/ scripts/install-daemon.sh scripts/uninstall-daemon.sh
git commit -m "feat(daemon): launchd plist + install/uninstall scripts"
```

---

## Phase D — CLI

### Task 11: Scaffold `apps/cli` workspace

**Files:**
- Create: `apps/cli/package.json`
- Create: `apps/cli/tsconfig.json`
- Create: `apps/cli/src/bin.ts`

- [ ] **Step 1: Write `apps/cli/package.json`**

```json
{
  "name": "@cca/cli",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "bin": { "cca": "./src/bin.ts" },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "cca": "tsx src/bin.ts"
  },
  "dependencies": {
    "@cca/core": "workspace:*",
    "@cca/db": "workspace:*",
    "commander": "12.1.0",
    "dayjs": "1.11.13",
    "eventsource-parser": "3.0.0",
    "picocolors": "1.1.1"
  }
}
```

- [ ] **Step 2: Write `apps/cli/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "allowImportingTsExtensions": true,
    "noEmit": true
  },
  "include": ["src/**/*"]
}
```

(`allowImportingTsExtensions` required because `@cca/cli` imports from `@cca/db` whose schema uses `.ts` imports — same constraint as `@cca/ingester`.)

- [ ] **Step 3: Write placeholder `apps/cli/src/bin.ts`**

```ts
import { config } from 'dotenv'
import { resolve } from 'node:path'
config({ path: resolve(process.cwd(), '../../.env.local') })

import { Command } from 'commander'

const program = new Command()
program.name('cca').description('Claude Code Analytics CLI').version('0.1.0')

program.parseAsync().catch((e) => { console.error(e); process.exit(1) })
```

- [ ] **Step 4: Install and verify**

```bash
cd /Users/amynporb/Documents/_Projects/ClaudeCode_Analytics
pnpm install
pnpm --filter @cca/cli typecheck
pnpm --filter @cca/cli run cca -- --help
```

Expected: `cca` prints usage.

- [ ] **Step 5: Add root `cca` script**

Edit root `package.json`. Add to `scripts`:

```json
"cca": "pnpm --filter @cca/cli run cca --"
```

- [ ] **Step 6: Commit**

```bash
git add apps/cli/ package.json pnpm-lock.yaml
git commit -m "feat(cli): scaffold @cca/cli workspace with commander entry"
```

---

### Task 12: `cca status`

**Files:**
- Create: `apps/cli/src/commands/status.ts`
- Modify: `apps/cli/src/bin.ts`

- [ ] **Step 1: Write `apps/cli/src/commands/status.ts`**

```ts
import { Command } from 'commander'
import pc from 'picocolors'
import { getDb, closeDb, events, sessions } from '@cca/db'
import { sql as dsql } from 'drizzle-orm'

export function statusCommand(): Command {
  return new Command('status')
    .description('Show daemon health, DB counts, and last event')
    .action(async () => {
      const db = getDb()
      const [ev] = await db
        .select({ count: dsql<number>`count(*)`, last: dsql<Date | null>`max(${events.timestamp})` })
        .from(events)
      const [se] = await db
        .select({
          count: dsql<number>`count(*)`,
          active: dsql<number>`count(*) filter (where ${sessions.status} = 'active')`,
        })
        .from(sessions)

      console.log(pc.bold('DB'))
      console.log(`  events:           ${Number(ev?.count ?? 0).toLocaleString()}`)
      console.log(`  sessions:         ${Number(se?.count ?? 0).toLocaleString()}`)
      console.log(`  active sessions:  ${Number(se?.active ?? 0)}`)
      console.log(`  last event:       ${ev?.last ? new Date(ev.last).toISOString() : 'never'}`)

      console.log(pc.bold('\nDaemon'))
      try {
        const r = await fetch('http://localhost:9939/status', { signal: AbortSignal.timeout(1000) })
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        const d = await r.json() as { ok: boolean; uptimeSec: number; subscribers: number; lastEventAt: string | null }
        console.log(`  ${pc.green('●')} running`)
        console.log(`  uptime:           ${d.uptimeSec}s`)
        console.log(`  subscribers:      ${d.subscribers}`)
        console.log(`  last event seen:  ${d.lastEventAt ?? 'none yet'}`)
      } catch (e) {
        console.log(`  ${pc.red('●')} not reachable on localhost:9939`)
        console.log(pc.dim(`  (${(e as Error).message})`))
      }

      await closeDb()
    })
}
```

- [ ] **Step 2: Register in `apps/cli/src/bin.ts`**

Add import and registration:

```ts
import { statusCommand } from './commands/status.js'
program.addCommand(statusCommand())
```

Place `addCommand` before `program.parseAsync()`.

- [ ] **Step 3: Smoke**

```bash
cd /Users/amynporb/Documents/_Projects/ClaudeCode_Analytics
pnpm cca status
```

Expected: prints DB summary with real numbers and daemon health.

- [ ] **Step 4: Commit**

```bash
git add apps/cli/
git commit -m "feat(cli): cca status — DB counts + daemon health"
```

---

### Task 13: `since.ts` helper

**Files:**
- Create: `apps/cli/src/lib/since.ts`
- Create: `apps/cli/tests/since.test.ts`

Parses `7d`, `24h`, `30m`, `2w`, `1y`, or `2026-04-01` into a `Date`.

- [ ] **Step 1: Write failing test** at `apps/cli/tests/since.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { parseSince } from '../src/lib/since.js'

describe('parseSince', () => {
  const now = new Date('2026-04-19T12:00:00Z')

  it('parses relative durations', () => {
    expect(parseSince('7d', now).toISOString()).toBe('2026-04-12T12:00:00.000Z')
    expect(parseSince('24h', now).toISOString()).toBe('2026-04-18T12:00:00.000Z')
    expect(parseSince('30m', now).toISOString()).toBe('2026-04-19T11:30:00.000Z')
    expect(parseSince('2w', now).toISOString()).toBe('2026-04-05T12:00:00.000Z')
    expect(parseSince('1y', now).toISOString()).toBe('2025-04-19T12:00:00.000Z')
  })

  it('parses an absolute ISO date', () => {
    expect(parseSince('2026-04-01', now).toISOString()).toBe('2026-04-01T00:00:00.000Z')
  })

  it('throws on garbage', () => {
    expect(() => parseSince('banana', now)).toThrow()
  })
})
```

- [ ] **Step 2: Run — expect failure**

```bash
pnpm test -- since
```

- [ ] **Step 3: Write `apps/cli/src/lib/since.ts`**

```ts
import dayjs from 'dayjs'

const REL = /^(\d+)([mhdwy])$/

export function parseSince(expr: string, now: Date = new Date()): Date {
  const m = REL.exec(expr)
  if (m) {
    const n = Number(m[1])
    const unit = m[2] as 'm' | 'h' | 'd' | 'w' | 'y'
    const map = { m: 'minute', h: 'hour', d: 'day', w: 'week', y: 'year' } as const
    return dayjs(now).subtract(n, map[unit]).toDate()
  }
  const parsed = dayjs(expr)
  if (!parsed.isValid()) throw new Error(`invalid --since value: ${expr}`)
  return parsed.toDate()
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
pnpm test -- since
```

- [ ] **Step 5: Commit**

```bash
git add apps/cli/
git commit -m "feat(cli): parseSince helper for --since 7d / absolute dates"
```

---

### Task 14: `cca sessions`

**Files:**
- Create: `apps/cli/src/commands/sessions.ts`
- Modify: `apps/cli/src/bin.ts`

- [ ] **Step 1: Write `apps/cli/src/commands/sessions.ts`**

```ts
import { Command } from 'commander'
import pc from 'picocolors'
import { getDb, closeDb, sessions } from '@cca/db'
import { and, desc, gte, ilike, sql } from 'drizzle-orm'
import { parseSince } from '../lib/since.js'

export function sessionsCommand(): Command {
  return new Command('sessions')
    .description('List sessions, newest first')
    .option('--project <glob>', 'filter by project path substring (ILIKE)')
    .option('--since <expr>', 'e.g. 7d, 24h, 2026-04-01')
    .option('--model <name>', 'filter to sessions that used this model')
    .option('--limit <n>', 'max rows', '25')
    .action(async (opts: { project?: string; since?: string; model?: string; limit: string }) => {
      const db = getDb()
      const conditions = []
      if (opts.project) conditions.push(ilike(sessions.projectPath, `%${opts.project}%`))
      if (opts.since) conditions.push(gte(sessions.startedAt, parseSince(opts.since)))
      if (opts.model) conditions.push(sql`${opts.model} = ANY(${sessions.modelsUsed})`)

      const rows = await db
        .select({
          sessionId: sessions.sessionId,
          projectPath: sessions.projectPath,
          startedAt: sessions.startedAt,
          durationSec: sessions.durationSec,
          messageCount: sessions.messageCount,
          toolCallCount: sessions.toolCallCount,
          cost: sessions.estimatedCostUsd,
          firstPrompt: sessions.firstUserPrompt,
          status: sessions.status,
        })
        .from(sessions)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(sessions.startedAt))
        .limit(Number(opts.limit))

      if (rows.length === 0) { console.log(pc.dim('no sessions found')); await closeDb(); return }

      for (const r of rows) {
        const dot = r.status === 'active' ? pc.green('●') : pc.dim('○')
        const when = r.startedAt ? new Date(r.startedAt).toISOString().slice(0, 19).replace('T', ' ') : '?'
        const dur = r.durationSec ? `${Math.round(r.durationSec / 60)}m` : '?'
        const msgs = String(r.messageCount ?? 0).padStart(4)
        const tools = String(r.toolCallCount ?? 0).padStart(4)
        const cost = r.cost ? `$${Number(r.cost).toFixed(2)}`.padStart(8) : '       -'
        const preview = (r.firstPrompt ?? '').replace(/\s+/g, ' ').slice(0, 60)
        console.log(
          `${dot} ${pc.dim(when)} ${pc.cyan(dur.padStart(4))} ${msgs}m ${tools}t ${cost} ${pc.yellow(r.sessionId.slice(0, 8))} ${pc.dim(r.projectPath ?? '')}`,
        )
        if (preview) console.log(`  ${pc.dim(preview)}`)
      }

      await closeDb()
    })
}
```

- [ ] **Step 2: Register in bin.ts**

Add `import { sessionsCommand } from './commands/sessions.js'` and `program.addCommand(sessionsCommand())`.

- [ ] **Step 3: Smoke**

```bash
pnpm cca sessions --limit 5
pnpm cca sessions --since 7d --limit 5
pnpm cca sessions --project ClaudeCode --limit 5
```

Expected: prints rows, newest first, with status dot, first-prompt preview.

- [ ] **Step 4: Commit**

```bash
git add apps/cli/
git commit -m "feat(cli): cca sessions with --project/--since/--model/--limit filters"
```

---

### Task 15: `cca replay <session-id>`

**Files:**
- Create: `apps/cli/src/commands/replay.ts`
- Modify: `apps/cli/src/bin.ts`

- [ ] **Step 1: Write `apps/cli/src/commands/replay.ts`**

```ts
import { Command } from 'commander'
import pc from 'picocolors'
import { getDb, closeDb, events } from '@cca/db'
import { asc, eq, sql } from 'drizzle-orm'

export function replayCommand(): Command {
  return new Command('replay')
    .description('Print every event in a session in chronological order')
    .argument('<session-id>', 'session uuid (or uuid prefix)')
    .option('--raw', 'dump raw JSONB payload per event', false)
    .action(async (sessionId: string, opts: { raw: boolean }) => {
      const db = getDb()

      const resolvedRows = await db.execute<{ session_id: string }>(
        sql`SELECT DISTINCT session_id FROM events WHERE session_id LIKE ${sessionId + '%'} LIMIT 2`
      )
      const matches = resolvedRows as unknown as Array<{ session_id: string }>
      if (matches.length === 0) { console.error(pc.red(`no session matching "${sessionId}"`)); process.exit(1) }
      if (matches.length > 1) { console.error(pc.red(`ambiguous prefix "${sessionId}"`)); process.exit(1) }
      const fullId = matches[0]!.session_id

      const rows = await db.select().from(events).where(eq(events.sessionId, fullId)).orderBy(asc(events.timestamp))

      for (const r of rows) {
        const t = r.timestamp ? new Date(r.timestamp).toISOString().slice(11, 19) : '        '
        const tag = pc.cyan(`${r.type}/${r.subtype ?? '-'}`.padEnd(28))
        if (opts.raw) {
          console.log(`${pc.dim(t)} ${tag} ${JSON.stringify(r.payload)}`)
          continue
        }
        const payload = r.payload as { message?: { content?: unknown } } | undefined
        const msg = payload?.message?.content
        let preview = ''
        if (typeof msg === 'string') preview = msg
        else if (Array.isArray(msg)) {
          const textBlock = msg.find((b: any) => b?.type === 'text')
          const toolUse = msg.find((b: any) => b?.type === 'tool_use')
          const toolResult = msg.find((b: any) => b?.type === 'tool_result')
          if (textBlock) preview = String((textBlock as any).text ?? '')
          else if (toolUse) preview = pc.yellow(`→ ${(toolUse as any).name}(${JSON.stringify((toolUse as any).input).slice(0, 120)})`)
          else if (toolResult) preview = pc.magenta(`← ${String((toolResult as any).content ?? '').slice(0, 120)}`)
        }
        console.log(`${pc.dim(t)} ${tag} ${preview.replace(/\s+/g, ' ').slice(0, 140)}`)
      }

      await closeDb()
    })
}
```

- [ ] **Step 2: Register, smoke**

```bash
SESS=$(psql "$CCA_DATABASE_URL" -tAc "SELECT session_id FROM sessions ORDER BY started_at DESC LIMIT 1")
pnpm cca replay "$SESS" | head -30
pnpm cca replay "${SESS:0:8}" --raw | head -5
```

Expected: prints first events; `--raw` shows JSON.

- [ ] **Step 3: Commit**

```bash
git add apps/cli/
git commit -m "feat(cli): cca replay <session-id> [--raw]"
```

---

### Task 16: `cca search <query>`

**Files:**
- Create: `apps/cli/src/commands/search.ts`
- Modify: `apps/cli/src/bin.ts`

Full-text search over `messages.text_tsv`.

- [ ] **Step 1: Write `apps/cli/src/commands/search.ts`**

```ts
import { Command } from 'commander'
import pc from 'picocolors'
import { getDb, closeDb } from '@cca/db'
import { sql } from 'drizzle-orm'
import { parseSince } from '../lib/since.js'

interface Row {
  session_id: string
  timestamp: Date
  role: string
  project_path: string | null
  snippet: string
  rank: number
}

export function searchCommand(): Command {
  return new Command('search')
    .description('Full-text search across all ingested messages')
    .argument('<query>', 'search terms (plainto_tsquery format)')
    .option('--since <expr>', 'e.g. 7d')
    .option('--project <glob>', 'project path substring (ILIKE)')
    .option('--limit <n>', 'max rows', '20')
    .action(async (query: string, opts: { since?: string; project?: string; limit: string }) => {
      const db = getDb()
      const since = opts.since ? parseSince(opts.since) : null
      const rows = await db.execute<Row>(sql`
        SELECT
          m.session_id,
          m.timestamp,
          m.role,
          s.project_path,
          ts_headline('english', m.text_content, plainto_tsquery('english', ${query}),
            'MaxWords=20, MinWords=5, ShortWord=2, MaxFragments=1, FragmentDelimiter=" … "'
          ) AS snippet,
          ts_rank(m.text_tsv, plainto_tsquery('english', ${query})) AS rank
        FROM messages m
        LEFT JOIN sessions s USING (session_id)
        WHERE m.text_tsv @@ plainto_tsquery('english', ${query})
          ${since ? sql`AND m.timestamp >= ${since}` : sql``}
          ${opts.project ? sql`AND s.project_path ILIKE ${'%' + opts.project + '%'}` : sql``}
        ORDER BY rank DESC, m.timestamp DESC
        LIMIT ${Number(opts.limit)}
      `)

      const results = rows as unknown as Row[]
      if (results.length === 0) { console.log(pc.dim('no matches')); await closeDb(); return }

      for (const r of results) {
        const when = new Date(r.timestamp).toISOString().slice(0, 19).replace('T', ' ')
        console.log(
          `${pc.dim(when)} ${pc.cyan(r.role.padEnd(10))} ${pc.yellow(r.session_id.slice(0, 8))} ${pc.dim(r.project_path ?? '')}`,
        )
        console.log(`  ${r.snippet.replace(/\s+/g, ' ')}`)
      }

      await closeDb()
    })
}
```

- [ ] **Step 2: Register, smoke**

```bash
pnpm cca search "postgres migration"
pnpm cca search "chokidar" --since 30d --limit 5
```

Expected: ranked matches with highlighted snippet.

- [ ] **Step 3: Commit**

```bash
git add apps/cli/
git commit -m "feat(cli): cca search with ts_headline snippets"
```

---

### Task 17: `cca stats`

**Files:**
- Create: `apps/cli/src/commands/stats.ts`
- Modify: `apps/cli/src/bin.ts`

- [ ] **Step 1: Write `apps/cli/src/commands/stats.ts`**

```ts
import { Command } from 'commander'
import pc from 'picocolors'
import { getDb, closeDb } from '@cca/db'
import { sql } from 'drizzle-orm'
import { parseSince } from '../lib/since.js'

interface ModelRow { model: string; in_tok: number; out_tok: number; cost: number }
interface ProjectRow { project_path: string | null; sessions: number; cost: number }
interface ToolRow { tool_name: string; calls: number; errors: number }

export function statsCommand(): Command {
  return new Command('stats')
    .description('Aggregate stats: tokens, cost, tools, projects')
    .option('--since <expr>', 'window, e.g. 7d', '30d')
    .action(async (opts: { since: string }) => {
      const db = getDb()
      const since = parseSince(opts.since)

      const models = await db.execute<ModelRow>(sql`
        SELECT model, SUM(input_tokens)::bigint AS in_tok, SUM(output_tokens)::bigint AS out_tok,
               SUM(
                 (input_tokens::numeric / 1e6) * p.input_per_mtok
               + (output_tokens::numeric / 1e6) * p.output_per_mtok
               + (cache_creation_tokens::numeric / 1e6) * p.cache_write_5m_per_mtok
               + (cache_read_tokens::numeric / 1e6) * p.cache_read_per_mtok
               )::numeric(10,2) AS cost
        FROM messages m LEFT JOIN model_pricing p USING (model)
        WHERE m.role = 'assistant' AND m.timestamp >= ${since} AND m.model IS NOT NULL
        GROUP BY m.model ORDER BY cost DESC NULLS LAST LIMIT 10
      `)
      const projects = await db.execute<ProjectRow>(sql`
        SELECT project_path, COUNT(*) AS sessions, SUM(estimated_cost_usd)::numeric(10,2) AS cost
        FROM sessions
        WHERE started_at >= ${since}
        GROUP BY project_path ORDER BY cost DESC NULLS LAST LIMIT 10
      `)
      const tools = await db.execute<ToolRow>(sql`
        SELECT tool_name, COUNT(*) AS calls, COUNT(*) FILTER (WHERE is_error) AS errors
        FROM tool_calls WHERE timestamp >= ${since}
        GROUP BY tool_name ORDER BY calls DESC LIMIT 10
      `)

      console.log(pc.bold(`\nTop models since ${opts.since}`))
      for (const m of models as unknown as ModelRow[]) {
        console.log(`  ${m.model.padEnd(36)} in=${Number(m.in_tok).toLocaleString().padStart(12)}  out=${Number(m.out_tok).toLocaleString().padStart(10)}  $${Number(m.cost).toFixed(2)}`)
      }

      console.log(pc.bold(`\nTop projects since ${opts.since}`))
      for (const p of projects as unknown as ProjectRow[]) {
        console.log(`  ${(p.project_path ?? '(none)').padEnd(60)} ${String(p.sessions).padStart(4)} sessions  $${Number(p.cost ?? 0).toFixed(2)}`)
      }

      console.log(pc.bold(`\nTop tools since ${opts.since}`))
      for (const t of tools as unknown as ToolRow[]) {
        const errRate = t.calls > 0 ? ((Number(t.errors) / Number(t.calls)) * 100).toFixed(1) : '0.0'
        console.log(`  ${t.tool_name.padEnd(16)} calls=${String(t.calls).padStart(6)}  errors=${String(t.errors).padStart(4)} (${errRate}%)`)
      }

      await closeDb()
    })
}
```

- [ ] **Step 2: Register, smoke**

```bash
pnpm cca stats --since 30d
```

Expected: three tables with realistic numbers.

- [ ] **Step 3: Commit**

```bash
git add apps/cli/
git commit -m "feat(cli): cca stats — models, projects, tools aggregates"
```

---

### Task 18: `cca tail --live`

**Files:**
- Create: `apps/cli/src/lib/sse-client.ts`
- Create: `apps/cli/src/commands/tail.ts`
- Modify: `apps/cli/src/bin.ts`

- [ ] **Step 1: Write `apps/cli/src/lib/sse-client.ts`**

```ts
import { EventSourceParserStream } from 'eventsource-parser/stream'

export interface SSEEvent { event: string; data: string }

export async function* consumeSse(
  url: string,
  signal: AbortSignal,
): AsyncGenerator<SSEEvent> {
  const res = await fetch(url, { signal, headers: { accept: 'text/event-stream' } })
  if (!res.ok) throw new Error(`SSE connect failed: ${res.status}`)
  if (!res.body) throw new Error('SSE response has no body')
  const stream = res.body
    .pipeThrough(new TextDecoderStream())
    .pipeThrough(new EventSourceParserStream())
  const reader = stream.getReader()
  while (true) {
    const { value, done } = await reader.read()
    if (done) return
    if (value.type === 'event') yield { event: value.event ?? 'message', data: value.data }
  }
}
```

- [ ] **Step 2: Write `apps/cli/src/commands/tail.ts`**

```ts
import { Command } from 'commander'
import pc from 'picocolors'
import { consumeSse } from '../lib/sse-client.js'

export function tailCommand(): Command {
  return new Command('tail')
    .description('Stream live daemon events (SSE)')
    .option('--port <n>', 'daemon port', '9939')
    .action(async (opts: { port: string }) => {
      const url = `http://localhost:${opts.port}/events`
      console.log(pc.dim(`[cca tail] connecting to ${url} ... (Ctrl-C to stop)`))
      const controller = new AbortController()
      process.on('SIGINT', () => controller.abort())
      try {
        for await (const { event, data } of consumeSse(url, controller.signal)) {
          const when = new Date().toISOString().slice(11, 19)
          const kind = event === 'status' ? pc.yellow(event) : event === 'event' ? pc.cyan(event) : pc.dim(event)
          console.log(`${pc.dim(when)} ${kind.padEnd(20)} ${data}`)
        }
      } catch (e) {
        if ((e as Error).name !== 'AbortError') console.error(pc.red(`tail: ${(e as Error).message}`))
      }
    })
}
```

- [ ] **Step 3: Register, smoke**

```bash
# terminal 1
( pnpm --filter @cca/ingester exec tsx src/cli.ts daemon ) &
DAEMON_PID=$!
sleep 1

# terminal 2
( pnpm cca tail ) &
TAIL_PID=$!
sleep 1

curl -s -X POST http://localhost:9939/hook -H 'content-type: application/json' \
  -d '{"sessionId":"smoke","event":"SessionStart"}'

sleep 1
kill -TERM $TAIL_PID $DAEMON_PID 2>/dev/null
wait 2>/dev/null
```

Expected: the tail prints a `status` event corresponding to the POST.

- [ ] **Step 4: Commit**

```bash
git add apps/cli/
git commit -m "feat(cli): cca tail — live SSE stream from daemon"
```

---

### Task 19: `cca open <session-id>` (stub)

**Files:**
- Create: `apps/cli/src/commands/open.ts`
- Modify: `apps/cli/src/bin.ts`

- [ ] **Step 1: Write `apps/cli/src/commands/open.ts`**

```ts
import { Command } from 'commander'
import pc from 'picocolors'
import { spawn } from 'node:child_process'

export function openCommand(): Command {
  return new Command('open')
    .description('Open the web UI at a specific session (Plan 3)')
    .argument('<session-id>', 'session uuid or prefix')
    .option('--port <n>', 'web UI port', '3939')
    .action(async (sessionId: string, opts: { port: string }) => {
      const url = `http://localhost:${opts.port}/session/${sessionId}`
      console.log(pc.dim(`opening ${url} ...`))
      spawn('open', [url], { stdio: 'ignore', detached: true }).unref()
      console.log(pc.yellow('(web UI is not yet built — see Plan 3)'))
    })
}
```

- [ ] **Step 2: Register, commit**

```bash
git add apps/cli/
git commit -m "feat(cli): cca open <session-id> stub (web UI from Plan 3)"
```

---

## Phase E — End-to-End Test + Polish

### Task 20: End-to-end daemon + hook integration test

**Files:**
- Create: `apps/ingester/tests/daemon.e2e.test.ts`

Starts the daemon against a synthetic home, appends events, confirms they flow through to the DB AND appear on the SSE stream.

- [ ] **Step 1: Write the test**

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { config } from 'dotenv'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdtempSync, writeFileSync, appendFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
const __dirname = dirname(fileURLToPath(import.meta.url))
config({ path: resolve(__dirname, '../../../.env.local') })

import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import * as schema from '@cca/db/schema'
import { Broadcaster } from '../src/daemon/broadcaster.js'
import { startTailer } from '../src/daemon/tailer.js'
import { startServer } from '../src/daemon/server.js'

const TEST_URL = process.env.CCA_DATABASE_URL_TEST!
const sql = postgres(TEST_URL, { max: 2 })
const db = drizzle(sql, { schema })
const PORT = 19942

describe('daemon e2e', () => {
  beforeAll(async () => {
    await sql`DELETE FROM events WHERE session_id = 'e2e-test'`
    await sql`INSERT INTO sessions (session_id) VALUES ('e2e-test') ON CONFLICT DO NOTHING`
  })
  afterAll(async () => { await sql.end() })

  it('ingests file changes + delivers via SSE + hook updates status', async () => {
    const home = mkdtempSync(resolve(tmpdir(), 'cca-e2e-'))
    mkdirSync(resolve(home, 'projects/-foo'), { recursive: true })
    const file = resolve(home, 'projects/-foo/s.jsonl')
    writeFileSync(file, '')

    const bc = new Broadcaster()
    const tailer = await startTailer({ claudeHome: home, db, broadcaster: bc, debounceMs: 50 })
    const server = await startServer({ port: PORT, db, broadcaster: bc, startedAt: Date.now() })

    const seen: string[] = []
    const controller = new AbortController()
    const sseTask = (async () => {
      const { consumeSse } = await import('../../cli/src/lib/sse-client.js')
      try {
        for await (const ev of consumeSse(`http://localhost:${PORT}/events`, controller.signal)) {
          seen.push(ev.event)
        }
      } catch { /* aborted */ }
    })()

    appendFileSync(file,
      `{"uuid":"e0000000-0000-0000-0000-000000000e2e","type":"user","timestamp":"2026-04-01T00:00:00Z","sessionId":"e2e-test","message":{"role":"user","content":"e2e"}}\n`
    )
    await fetch(`http://localhost:${PORT}/hook`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId: 'e2e-test', event: 'SessionStart' }),
    })

    await new Promise((r) => setTimeout(r, 700))

    const rows = await sql`SELECT COUNT(*) AS n FROM events WHERE session_id = 'e2e-test'`
    expect(Number(rows[0]!.n)).toBe(1)

    expect(seen).toContain('event')
    expect(seen).toContain('status')

    const st = await sql`SELECT status FROM sessions WHERE session_id = 'e2e-test'`
    expect(st[0]?.status).toBe('active')

    controller.abort()
    await Promise.race([sseTask, new Promise((r) => setTimeout(r, 100))])
    await tailer.stop()
    await server.stop()
  }, 10_000)
})
```

- [ ] **Step 2: Run**

```bash
pnpm test -- daemon.e2e
```

Expected: 1/1 pass.

- [ ] **Step 3: Commit**

```bash
git add apps/ingester/
git commit -m "test(ingester): daemon e2e — tailer + SSE + hook status"
```

---

### Task 21: Install and run the real daemon + hooks

**Files:** no code changes — installation + manual verification.

- [ ] **Step 1: Install the hooks**

```bash
cd /Users/amynporb/Documents/_Projects/ClaudeCode_Analytics
bash scripts/install-hooks.sh
jq '.hooks | keys' ~/.claude/settings.json
```

Expected: keys include `SessionStart`, `SessionEnd`, `Stop`, and the existing `PreToolUse` (rtk).

- [ ] **Step 2: Install the daemon**

```bash
bash scripts/install-daemon.sh
sleep 3
launchctl list | grep com.aporb.cca.ingester
curl -s http://localhost:9939/status | jq .
```

Expected: daemon listed; status returns `{ok:true,...}`.

- [ ] **Step 3: Smoke via a real CC session**

Open a Claude Code session in any directory and run a short prompt. Then:

```bash
curl -s http://localhost:9939/status | jq .
```

Expected: `lastEventAt` updates to within the last minute.

```bash
pnpm cca status
pnpm cca sessions --limit 5
pnpm cca stats --since 7d
```

All should show live-updating data.

- [ ] **Step 4: Update STATUS.md**

Append the following section to `STATUS.md`:

```markdown
## 2026-04-19 — Plan 2 (Live capture + CLI) complete

- `chokidar` tailer watches `~/.claude/projects/**/*.jsonl` in real time
- HTTP server on `localhost:9939` with `/status`, `/hook`, `/events` (SSE)
- `cca-ping.sh` registered via `~/.claude/settings.json` for SessionStart / SessionEnd / Stop
- launchd daemon `com.aporb.cca.ingester` runs at login (install via `bash scripts/install-daemon.sh`)
- `cca` CLI with subcommands: status, sessions, replay, search, stats, tail, open
- 46+ tests pass

### Daemon ops quick-ref

- Start:     `launchctl load ~/Library/LaunchAgents/com.aporb.cca.ingester.plist`
- Stop:      `launchctl unload ~/Library/LaunchAgents/com.aporb.cca.ingester.plist`
- Status:    `curl -s http://localhost:9939/status | jq .`
- Tail logs: `tail -f ~/Library/Logs/cca/daemon.log`

### Next

Plan 3 (Web UI) — Next.js 16 App Router on `localhost:3939`. Sessions list, session detail / replay, search, analytics dashboard, live activity indicator via the daemon's SSE.
```

- [ ] **Step 5: Commit**

```bash
git add STATUS.md
git commit -m "chore: mark Plan 2 (Live Capture + CLI) complete"
```

---

## Self-Review

**Spec coverage** (mapping spec §6 components → tasks):

- §6.1 Ingester daemon: backfiller (Plan 1 done) + live tailer (Tasks 4–5) + hook relay (Task 6) ✓
- §6.1 Cost calculator runs on derived message insert — reused from Plan 1 ✓
- §6.2 CLI commands: status (12), backfill (Plan 1), replay (15), search (16), stats (17), tail (18), open (19). `rebuild-derived` stays under `pnpm --filter @cca/ingester` (ops command, not user review).
- §7.2 Live (<1s lag): chokidar + 200ms default debounce → ~250ms lag typical, meets goal ✓
- §7.2 Cursor persistence: `ingestCursors` table reused from Plan 1; updated in Task 4 ✓
- §7.3 Hooks: `cca-ping.sh` (Task 8), install/uninstall (Task 9), registered for SessionStart/SessionEnd/Stop ✓
- §8 Tech stack: chokidar 4, commander 12, picocolors, dayjs, SSE via plain `http` + `eventsource-parser` — all in deps after Tasks 1 & 11.
- §11.1 "Tailer as primary capture, hooks as liveness-only" — honored: hooks only publish `{sessionId, event}` to `/hook`, no content.

**Placeholder scan**: None — every code step has complete code; every command has expected output.

**Type consistency check**:
- `Broadcaster`/`Subscriber`/`BroadcastEvent` types defined in Task 3; used identically in Tasks 4, 5, 6, 7.
- `Db` type alias (`PostgresJsDatabase<typeof schema>`) consistent across daemon modules.
- `ingestCursors` column names `sourceFile`/`byteOffset`/`updatedAt` match Plan 1's schema.
- `sessions.status` values: `'active'` and `'ended'` — consistent in Task 6 hook mapping + Task 12 status query + Task 14 list dot indicator.
- `parseSince` used identically in Tasks 14, 16, 17 (sessions / search / stats).

**Scope check**: Plan produces a working real-time capture + terminal-based review experience. Plan 3 (web UI) is the next and final plan.

No issues found.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-04-19-cca-live-capture-and-cli.md`.**

Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using superpowers:executing-plans, batch execution with checkpoints for your review.

**Which approach?**
