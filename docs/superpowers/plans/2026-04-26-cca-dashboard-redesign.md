# CCA Dashboard Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the dashboard redesign described in `docs/superpowers/specs/2026-04-26-cca-dashboard-redesign.md`. Replace the current `apps/web` UI with a cost-anchored hub-and-spokes IA: home becomes a cost command center, sessions list moves to `/sessions`, session detail leads with outcomes, `/stats` becomes "Behavior". Add a global time picker and a rule-based briefing engine.

**Architecture:** Server components throughout (Next.js 16 App Router). Per-route query modules in `apps/web/lib/queries/` consume a shared `parseSince/resolveSince` helper that reads the global `?since=` URL param. New `apps/web/lib/briefing.ts` is a pure rule-based narrative generator (no LLM). UI-only — no DB schema or ingest changes; new metrics computed on demand from existing tables and the `usage_daily` materialized view.

**Tech Stack:** Next.js 16, React 19, Tailwind 3, shadcn/ui, Recharts, Drizzle ORM, Postgres 17, Vitest, React Testing Library. (All already installed.)

**Working branch:** `feat/dashboard-redesign` — create from `main` before Task 1.

```bash
cd /Users/amynporb/Documents/_Projects/ClaudeCode_Analytics
git checkout -b feat/dashboard-redesign
```

---

## File structure

### Modify

| Path | Change |
|---|---|
| `apps/web/lib/since.ts` | Extend `parseSince` with `today`/`all`/ISO-pair tokens; add `resolveSince` helper |
| `apps/web/app/globals.css` | Add three model color tokens (HSL) |
| `apps/web/app/layout.tsx` | Replace inline nav with new `<Nav>` component; add header time picker |
| `apps/web/app/page.tsx` | Rewrite as Cost command center |
| `apps/web/app/search/page.tsx` | Add model/role chips, cost dot per row, real pagination — preserves the existing snippet rendering pattern unchanged |
| `apps/web/app/stats/page.tsx` | Rewrite as Behavior page; remove ActivityHeatmap |
| `apps/web/app/session/[id]/page.tsx` | Rewrite to lead with outcomes summary; collapsible replay |
| `apps/web/components/SessionFilters.tsx` | Drop `since` field (now global); add model chip multi-select |
| `apps/web/components/SearchForm.tsx` | Add model + role chip selectors |

### Create

| Path | Purpose |
|---|---|
| `apps/web/lib/queries/cost.ts` | KPIs, spend stacked-by-model, top sessions, cost distribution, cache trend, hour×dow heatmap, briefing inputs |
| `apps/web/lib/queries/sessions.ts` | `listSessions` (extracted from current `lib/queries.ts`) |
| `apps/web/lib/queries/session.ts` | `getSessionMeta`, `getSessionEvents`, `getSessionToolCalls`, plus new `getSessionStats`, `getSessionTopTools`, `getSessionFilesTouched`, `getSessionFirstPrompts` |
| `apps/web/lib/queries/search.ts` | Refactored FTS query helpers (currently inline in the page file) |
| `apps/web/lib/queries/behavior.ts` | Tool error rate trend, prompt→response latency P50/P95, subagent histogram, token velocity scatter, cache hit by model |
| `apps/web/lib/briefing.ts` | Pure rule-based narrative generator |
| `apps/web/lib/since.test.ts` | Unit tests for `parseSince`/`resolveSince` |
| `apps/web/lib/briefing.test.ts` | Unit tests for briefing rules and edge cases |
| `apps/web/lib/queries/cost.test.ts` | Real-DB tests for cost queries |
| `apps/web/lib/queries/session.test.ts` | Real-DB tests for new session queries |
| `apps/web/lib/queries/behavior.test.ts` | Real-DB tests for behavior queries |
| `apps/web/components/Nav.tsx` | Server-rendered nav (links + slots for client components) |
| `apps/web/components/TimePicker.tsx` | Client component (dropdown + custom popover, writes URL+cookie) |
| `apps/web/components/cost/KpiStrip.tsx` | 5-cell KPI strip |
| `apps/web/components/cost/BriefingCard.tsx` | Renders the briefing template |
| `apps/web/components/cost/TopCostSessions.tsx` | Top-cost sessions table |
| `apps/web/components/cost/CostDistributionCard.tsx` | P50/P95/P99/max card |
| `apps/web/components/charts/StackedAreaSpend.tsx` | Recharts stacked area, spend by model |
| `apps/web/components/charts/CacheHitTrend.tsx` | Recharts line for daily cache hit % |
| `apps/web/components/charts/ActiveHoursHeatmap.tsx` | Hour × day-of-week heatmap (24×7 grid) |
| `apps/web/components/charts/ToolErrorRateTrend.tsx` | Recharts line, daily error rate |
| `apps/web/components/charts/LatencyPercentiles.tsx` | Recharts line, P50/P95 series |
| `apps/web/components/charts/SubagentHistogram.tsx` | Recharts bar histogram |
| `apps/web/components/charts/TokenVelocityScatter.tsx` | Recharts scatter |
| `apps/web/components/session/StatsStrip.tsx` | 6-cell stat strip (cost/messages/tools/errors/cache/subagents) |
| `apps/web/components/session/TopToolsPanel.tsx` | Per-session top tools table |
| `apps/web/components/session/FilesTouchedPanel.tsx` | Files touched list |
| `apps/web/components/session/CostSplitPanel.tsx` | Cost split by model + token totals |
| `apps/web/components/session/FirstPromptsStrip.tsx` | First 3 user prompts |
| `apps/web/components/session/CollapsibleReplay.tsx` | Wraps existing replay timeline; collapsed by default |
| `apps/web/app/sessions/page.tsx` | New route — sessions list (was `/`) |
| `apps/web/vitest.config.ts` | Web-specific Vitest config — only if `pnpm --filter @cca/web test` doesn't already work |

### Delete

| Path | Why |
|---|---|
| `apps/web/lib/queries.ts` | Contents move to per-route modules under `lib/queries/` |
| `apps/web/components/charts/CostByProject.tsx` | Replaced by stacked-area model spend on `/` |
| `apps/web/components/charts/TokensOverTime.tsx` | Tokens chart subsumed by stacked-area spend |
| `apps/web/components/charts/ActivityHeatmap.tsx` | 13-week grid replaced by hour×dow heatmap on `/` |

---

## Common test setup

All tests use Vitest. Real-DB tests use `CCA_DATABASE_URL_TEST` (already in `.env.local`). Tests run from repo root with `pnpm test`. If `apps/web/vitest.config.ts` doesn't exist after Task 1, create it:

```ts
// apps/web/vitest.config.ts
import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    environment: 'node',
    fileParallelism: false,
    setupFiles: [],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
      '@cca/db': path.resolve(__dirname, '../../packages/db/src'),
      '@cca/core': path.resolve(__dirname, '../../packages/core/src'),
    },
  },
})
```

Component tests requiring DOM rendering use `environment: 'jsdom'` per-file via `// @vitest-environment jsdom`.

---

## Tasks

### Task 1: Extend `since.ts` with new tokens and `resolveSince` helper

**Files:**
- Modify: `apps/web/lib/since.ts`
- Create: `apps/web/lib/since.test.ts`
- Maybe Create: `apps/web/vitest.config.ts` (only if `pnpm --filter @cca/web test` doesn't already work)

- [ ] **Step 1: Verify Vitest runs in `apps/web`**

```bash
pnpm --filter @cca/web test --run 2>&1 | head -20
```
Expected: either "no test files found" (Vitest works, just no tests yet) or a config error. If you see a config error, create `apps/web/vitest.config.ts` per the "Common test setup" block above.

- [ ] **Step 2: Write the test file**

Create `apps/web/lib/since.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { parseSince, resolveSince } from './since'

describe('parseSince', () => {
  const NOW = new Date('2026-04-26T13:00:00Z')

  it('parses relative units (m/h/d/w/y)', () => {
    expect(parseSince('1d', NOW)?.toISOString()).toBe('2026-04-25T13:00:00.000Z')
    expect(parseSince('7d', NOW)?.toISOString()).toBe('2026-04-19T13:00:00.000Z')
    expect(parseSince('1w', NOW)?.toISOString()).toBe('2026-04-19T13:00:00.000Z')
    expect(parseSince('2h', NOW)?.toISOString()).toBe('2026-04-26T11:00:00.000Z')
  })

  it('parses the today token at start of local day', () => {
    const got = parseSince('today', NOW)
    expect(got).not.toBeNull()
    expect(got!.getHours()).toBe(0)
    expect(got!.getMinutes()).toBe(0)
  })

  it('parses the all token as null sentinel', () => {
    expect(parseSince('all', NOW)).toBeNull()
  })

  it('parses ISO single dates', () => {
    expect(parseSince('2026-04-01', NOW)?.toISOString().slice(0, 10)).toBe('2026-04-01')
  })

  it('returns null for garbage', () => {
    expect(parseSince('garbage', NOW)).toBeNull()
    expect(parseSince('', NOW)).toBeNull()
  })
})

describe('resolveSince', () => {
  const NOW = new Date('2026-04-26T13:00:00Z')

  it('returns {start,end} for a relative window', () => {
    const r = resolveSince('7d', NOW)
    expect(r.start.toISOString()).toBe('2026-04-19T13:00:00.000Z')
    expect(r.end.toISOString()).toBe(NOW.toISOString())
    expect(r.label).toBe('Last 7d')
  })

  it('returns ISO-pair window', () => {
    const r = resolveSince('2026-04-01..2026-04-15', NOW)
    expect(r.start.toISOString().slice(0, 10)).toBe('2026-04-01')
    expect(r.end.toISOString().slice(0, 10)).toBe('2026-04-15')
    expect(r.label).toBe('2026-04-01 → 2026-04-15')
  })

  it('returns all time with start = epoch', () => {
    const r = resolveSince('all', NOW)
    expect(r.start.toISOString()).toBe('1970-01-01T00:00:00.000Z')
    expect(r.end.toISOString()).toBe(NOW.toISOString())
    expect(r.label).toBe('All time')
  })

  it('falls back to default 7d when expr is undefined', () => {
    const r = resolveSince(undefined, NOW)
    expect(r.start.toISOString()).toBe('2026-04-19T13:00:00.000Z')
    expect(r.label).toBe('Last 7d')
  })

  it('falls back to default for invalid expr', () => {
    const r = resolveSince('garbage', NOW)
    expect(r.start.toISOString()).toBe('2026-04-19T13:00:00.000Z')
    expect(r.label).toBe('Last 7d')
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
pnpm --filter @cca/web test --run since.test.ts
```
Expected: FAIL — `resolveSince is not exported`, plus failures for `today`/`all`/ISO-pair cases.

- [ ] **Step 4: Replace `since.ts` with the extended version**

Overwrite `apps/web/lib/since.ts`:

```ts
import dayjs from 'dayjs'

const REL = /^(\d+)([mhdwy])$/
const ISO_PAIR = /^(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})$/

export interface Since {
  start: Date
  end: Date
  label: string
}

export function parseSince(expr: string, now: Date = new Date()): Date | null {
  if (!expr) return null
  if (expr === 'all') return null
  if (expr === 'today') return dayjs(now).startOf('day').toDate()
  const m = REL.exec(expr)
  if (m) {
    const n = Number(m[1])
    const unit = m[2] as 'm' | 'h' | 'd' | 'w' | 'y'
    const map = { m: 'minute', h: 'hour', d: 'day', w: 'week', y: 'year' } as const
    return dayjs(now).subtract(n, map[unit]).toDate()
  }
  const parsed = dayjs(expr)
  return parsed.isValid() ? parsed.toDate() : null
}

const RELATIVE_LABELS: Record<string, string> = {
  today: 'Today',
  '1d': 'Last 24h',
  '7d': 'Last 7d',
  '30d': 'Last 30d',
  '90d': 'Last 90d',
  all: 'All time',
}

const DEFAULT_EXPR = '7d'

export function resolveSince(expr: string | undefined, now: Date = new Date()): Since {
  const e = expr ?? DEFAULT_EXPR
  const pair = ISO_PAIR.exec(e)
  if (pair) {
    const start = new Date(`${pair[1]}T00:00:00Z`)
    const end = new Date(`${pair[2]}T23:59:59.999Z`)
    return { start, end, label: `${pair[1]} → ${pair[2]}` }
  }
  if (e === 'all') {
    return { start: new Date(0), end: now, label: 'All time' }
  }
  const start = parseSince(e, now) ?? parseSince(DEFAULT_EXPR, now)!
  const label = RELATIVE_LABELS[e] ?? RELATIVE_LABELS[DEFAULT_EXPR]
  return { start, end: now, label }
}
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
pnpm --filter @cca/web test --run since.test.ts
```
Expected: PASS — all `parseSince` and `resolveSince` cases green.

- [ ] **Step 6: Typecheck and commit**

```bash
pnpm --filter @cca/web typecheck
git add apps/web/lib/since.ts apps/web/lib/since.test.ts
[ -f apps/web/vitest.config.ts ] && git add apps/web/vitest.config.ts
git commit -m "feat(web): extend since helper with today/all/iso-pair + resolveSince"
```

---

### Task 2: Add model color tokens to globals.css

**Files:**
- Modify: `apps/web/app/globals.css`

- [ ] **Step 1: Append the model tokens to globals.css**

Append to the end of `apps/web/app/globals.css` (or append into the `:root` block — keep dark-mode parity if there's a `.dark` block):

```css
:root {
  --model-opus: 265 90% 76%;
  --model-sonnet: 142 70% 45%;
  --model-haiku: 217 91% 60%;
}

.dark {
  --model-opus: 265 90% 76%;
  --model-sonnet: 142 70% 50%;
  --model-haiku: 217 91% 65%;
}
```

- [ ] **Step 2: Verify the build still compiles**

```bash
pnpm --filter @cca/web build 2>&1 | tail -20
```
Expected: build succeeds (Turbopack output, no CSS errors).

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/globals.css
git commit -m "feat(web): add model color tokens (Opus purple / Sonnet green / Haiku blue)"
```

---

### Task 3: TimePicker client component

**Files:**
- Create: `apps/web/components/TimePicker.tsx`
- Create: `apps/web/components/TimePicker.test.tsx`

- [ ] **Step 1: Install testing-library if missing**

Check `apps/web/package.json`. If `@testing-library/react` isn't there:
```bash
pnpm --filter @cca/web add -D @testing-library/react @testing-library/jest-dom jsdom
```

- [ ] **Step 2: Write the test**

Create `apps/web/components/TimePicker.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TimePicker } from './TimePicker'

const push = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}))

beforeEach(() => {
  push.mockClear()
  document.cookie = ''
})

describe('TimePicker', () => {
  it('renders default 7d label when no value provided', () => {
    render(<TimePicker value={undefined} />)
    expect(screen.getByRole('button')).toHaveTextContent('Last 7d')
  })

  it('renders matching preset for current value', () => {
    render(<TimePicker value="30d" />)
    expect(screen.getByRole('button')).toHaveTextContent('Last 30d')
  })

  it('writes ?since=Xd to URL on selection', () => {
    render(<TimePicker value="7d" />)
    fireEvent.click(screen.getByRole('button'))
    fireEvent.click(screen.getByText('Last 30d'))
    expect(push).toHaveBeenCalledWith(expect.stringContaining('since=30d'))
  })

  it('writes the cookie on selection', () => {
    render(<TimePicker value="7d" />)
    fireEvent.click(screen.getByRole('button'))
    fireEvent.click(screen.getByText('Last 30d'))
    expect(document.cookie).toContain('cca-since=30d')
  })
})
```

- [ ] **Step 3: Run the test, expect it to fail**

```bash
pnpm --filter @cca/web test --run TimePicker.test.tsx
```
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `TimePicker.tsx`**

Create `apps/web/components/TimePicker.tsx`:

```tsx
'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useState, useRef, useEffect } from 'react'

const PRESETS = [
  { value: 'today', label: 'Today' },
  { value: '7d', label: 'Last 7d' },
  { value: '30d', label: 'Last 30d' },
  { value: '90d', label: 'Last 90d' },
  { value: 'all', label: 'All time' },
] as const

const COOKIE = 'cca-since'

function labelFor(v: string | undefined): string {
  if (!v) return 'Last 7d'
  const preset = PRESETS.find((p) => p.value === v)
  if (preset) return preset.label
  if (/^\d{4}-\d{2}-\d{2}\.\.\d{4}-\d{2}-\d{2}$/.test(v)) return v.replace('..', ' → ')
  return 'Last 7d'
}

export function TimePicker({ value }: { value: string | undefined }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [open, setOpen] = useState(false)
  const [customOpen, setCustomOpen] = useState(false)
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setCustomOpen(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  function apply(expr: string) {
    document.cookie = `${COOKIE}=${expr}; path=/; max-age=${60 * 60 * 24 * 365}`
    const next = new URLSearchParams(searchParams.toString())
    next.set('since', expr)
    router.push(`${pathname}?${next.toString()}`)
    setOpen(false)
    setCustomOpen(false)
  }

  function applyCustom() {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(customStart) || !/^\d{4}-\d{2}-\d{2}$/.test(customEnd)) return
    apply(`${customStart}..${customEnd}`)
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="text-sm px-3 py-1.5 rounded-md border border-border hover:bg-muted/50"
      >
        {labelFor(value)} ▾
      </button>
      {open && (
        <div className="absolute right-0 mt-1 z-10 w-48 rounded-md border border-border bg-background shadow-md py-1">
          {PRESETS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => apply(p.value)}
              className="block w-full text-left px-3 py-1.5 text-sm hover:bg-muted/50"
            >
              {p.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setCustomOpen((c) => !c)}
            className="block w-full text-left px-3 py-1.5 text-sm hover:bg-muted/50 border-t border-border mt-1 pt-2"
          >
            Custom…
          </button>
          {customOpen && (
            <div className="px-3 py-2 space-y-2 border-t border-border">
              <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)}
                className="w-full text-xs px-2 py-1 rounded border border-border bg-background" />
              <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)}
                className="w-full text-xs px-2 py-1 rounded border border-border bg-background" />
              <button type="button" onClick={applyCustom}
                className="w-full text-xs px-2 py-1 rounded bg-primary text-primary-foreground">
                Apply
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Run the test, expect it to pass**

```bash
pnpm --filter @cca/web test --run TimePicker.test.tsx
```
Expected: PASS.

- [ ] **Step 6: Typecheck + commit**

```bash
pnpm --filter @cca/web typecheck
git add apps/web/components/TimePicker.tsx apps/web/components/TimePicker.test.tsx
git commit -m "feat(web): TimePicker client component with URL+cookie persistence"
```

---

### Task 4: Nav rebuild + layout integration

**Files:**
- Create: `apps/web/components/Nav.tsx`
- Modify: `apps/web/app/layout.tsx`

- [ ] **Step 1: Create `Nav.tsx`**

Create `apps/web/components/Nav.tsx`:

```tsx
import Link from 'next/link'
import { cookies } from 'next/headers'
import { TimePicker } from './TimePicker'
import { LiveIndicator } from './LiveIndicator'

const items = [
  { href: '/', label: 'Cost' },
  { href: '/sessions', label: 'Sessions' },
  { href: '/search', label: 'Search' },
  { href: '/stats', label: 'Behavior' },
] as const

export async function Nav({ since }: { since: string | undefined }) {
  const cookieStore = await cookies()
  const cookieSince = cookieStore.get('cca-since')?.value
  const effective = since ?? cookieSince
  return (
    <header className="border-b">
      <div className="max-w-7xl mx-auto flex items-center gap-6 px-6 h-14">
        <Link href="/" className="font-semibold">cca</Link>
        <nav className="flex items-center gap-6 text-sm text-muted-foreground flex-1">
          {items.map((item) => (
            <Link key={item.href} href={item.href} className="hover:text-foreground transition-colors">
              {item.label}
            </Link>
          ))}
        </nav>
        <TimePicker value={effective} />
        <LiveIndicator />
      </div>
    </header>
  )
}
```

- [ ] **Step 2: Update `layout.tsx` to use `<Nav>`**

Replace `apps/web/app/layout.tsx`:

```tsx
import type { Metadata } from 'next'
import './globals.css'
import { Nav } from '@/components/Nav'

export const metadata: Metadata = {
  title: 'Claude Code Analytics',
  description: 'Review your Claude Code sessions locally',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-mono antialiased bg-background text-foreground min-h-screen">
        <Nav since={undefined} />
        <div className="max-w-7xl mx-auto px-6 py-8">{children}</div>
      </body>
    </html>
  )
}
```

Note: in App Router, the root layout cannot read `searchParams`. Each page server component handles its own URL `?since=`; the Nav reads only the cookie + falls back to default. The TimePicker reads URL on the client side.

- [ ] **Step 3: Build to confirm nav renders**

```bash
pnpm --filter @cca/web build 2>&1 | tail -10
```
Expected: build succeeds. New nav order: Cost · Sessions · Search · Behavior · time picker · live indicator.

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/Nav.tsx apps/web/app/layout.tsx
git commit -m "feat(web): rebuild nav with TimePicker and Behavior link"
```

---

### Task 5: Restructure existing queries into per-route modules

**Files:**
- Create: `apps/web/lib/queries/sessions.ts`
- Create: `apps/web/lib/queries/session.ts`
- Create: `apps/web/lib/queries/search.ts`
- Delete: `apps/web/lib/queries.ts`
- Modify: `apps/web/app/page.tsx`, `apps/web/app/session/[id]/page.tsx`, `apps/web/app/search/page.tsx`, `apps/web/app/stats/page.tsx` (just import path swaps and a temporary stub for `/stats`; rewrites come later)

- [ ] **Step 1: Create `apps/web/lib/queries/sessions.ts`**

```ts
import 'server-only'
import { getDb } from '../db'
import { sessions } from '@cca/db/schema'
import { and, desc, gte, ilike, lte, sql } from 'drizzle-orm'

export interface SessionsQuery {
  project?: string
  since?: { start: Date; end: Date }
  models?: string[]
  sortBy?: 'recent' | 'cost'
  limit?: number
  offset?: number
}

export async function listSessions(q: SessionsQuery) {
  const db = getDb()
  const conditions = []
  if (q.project) conditions.push(ilike(sessions.projectPath, `%${q.project}%`))
  if (q.since) {
    conditions.push(gte(sessions.startedAt, q.since.start))
    conditions.push(lte(sessions.startedAt, q.since.end))
  }
  if (q.models?.length) {
    conditions.push(sql`${sessions.modelsUsed} && ${sql.raw(`ARRAY[${q.models.map((m) => `'${m}'`).join(',')}]::text[]`)}`)
  }
  const order = q.sortBy === 'cost' ? sql`${sessions.estimatedCostUsd} DESC NULLS LAST` : desc(sessions.startedAt)
  return db
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
      modelsUsed: sessions.modelsUsed,
    })
    .from(sessions)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(order)
    .limit(q.limit ?? 50)
    .offset(q.offset ?? 0)
}

export async function countSessions(q: Pick<SessionsQuery, 'project' | 'since' | 'models'>): Promise<number> {
  const db = getDb()
  const conditions = []
  if (q.project) conditions.push(ilike(sessions.projectPath, `%${q.project}%`))
  if (q.since) {
    conditions.push(gte(sessions.startedAt, q.since.start))
    conditions.push(lte(sessions.startedAt, q.since.end))
  }
  if (q.models?.length) {
    conditions.push(sql`${sessions.modelsUsed} && ${sql.raw(`ARRAY[${q.models.map((m) => `'${m}'`).join(',')}]::text[]`)}`)
  }
  const [row] = await db
    .select({ c: sql<number>`COUNT(*)::int` })
    .from(sessions)
    .where(conditions.length ? and(...conditions) : undefined)
  return row.c
}
```

- [ ] **Step 2: Create `apps/web/lib/queries/session.ts`**

```ts
import 'server-only'
import { getDb } from '../db'
import { sessions, events, toolCalls } from '@cca/db/schema'
import { asc, eq, sql } from 'drizzle-orm'

export async function getSessionMeta(sessionId: string) {
  const db = getDb()
  const [row] = await db.select().from(sessions).where(eq(sessions.sessionId, sessionId)).limit(1)
  return row ?? null
}

export async function getSessionEvents(sessionId: string) {
  const db = getDb()
  return db.select().from(events).where(eq(events.sessionId, sessionId)).orderBy(asc(events.timestamp))
}

export async function getSessionToolCalls(sessionId: string) {
  const db = getDb()
  return db.select().from(toolCalls).where(eq(toolCalls.sessionId, sessionId)).orderBy(asc(toolCalls.timestamp))
}

export async function getSessionStats(sessionId: string) {
  const db = getDb()
  const rows = await db.execute<{
    cache_read: string
    input_tokens: string
    output_tokens: string
    cache_create: string
    cost_by_model: { model: string; cost: number }[]
  }>(sql`
    WITH per_model AS (
      SELECT m.model,
             SUM(m.input_tokens)::bigint AS in_tok,
             SUM(m.output_tokens)::bigint AS out_tok,
             SUM(m.cache_read_tokens)::bigint AS cache_read,
             SUM(m.cache_creation_tokens)::bigint AS cache_create,
             COALESCE(SUM(
               m.input_tokens * mp.input_per_mtok / 1e6
             + m.output_tokens * mp.output_per_mtok / 1e6
             + m.cache_creation_tokens * mp.cache_write_5m_per_mtok / 1e6
             + m.cache_read_tokens * mp.cache_read_per_mtok / 1e6
             ), 0) AS cost
      FROM messages m
      LEFT JOIN model_pricing mp ON mp.model = m.model
      WHERE m.session_id = ${sessionId} AND m.role = 'assistant' AND m.model IS NOT NULL
      GROUP BY m.model
    )
    SELECT
      COALESCE(SUM(cache_read), 0)::bigint AS cache_read,
      COALESCE(SUM(in_tok), 0)::bigint AS input_tokens,
      COALESCE(SUM(out_tok), 0)::bigint AS output_tokens,
      COALESCE(SUM(cache_create), 0)::bigint AS cache_create,
      COALESCE(json_agg(json_build_object('model', model, 'cost', cost) ORDER BY cost DESC), '[]'::json) AS cost_by_model
    FROM per_model
  `)
  const row = (rows as unknown as Array<{
    cache_read: string; input_tokens: string; output_tokens: string; cache_create: string
    cost_by_model: { model: string; cost: number }[]
  }>)[0]
  const inTok = Number(row?.input_tokens ?? 0)
  const cacheRead = Number(row?.cache_read ?? 0)
  return {
    inputTokens: inTok,
    outputTokens: Number(row?.output_tokens ?? 0),
    cacheReadTokens: cacheRead,
    cacheCreateTokens: Number(row?.cache_create ?? 0),
    cacheHitPct: inTok + cacheRead > 0 ? cacheRead / (inTok + cacheRead) : 0,
    costByModel: (row?.cost_by_model ?? []).map((c) => ({ model: c.model, cost: Number(c.cost) })),
  }
}

export async function getSessionTopTools(sessionId: string, limit = 5) {
  const db = getDb()
  const rows = await db.execute<{ tool_name: string; calls: string; errors: string }>(sql`
    SELECT tool_name,
           COUNT(*)::int AS calls,
           COUNT(*) FILTER (WHERE is_error)::int AS errors
    FROM tool_calls
    WHERE session_id = ${sessionId}
    GROUP BY tool_name
    ORDER BY calls DESC
    LIMIT ${limit}
  `)
  return (rows as unknown as Array<{ tool_name: string; calls: string; errors: string }>).map((r) => ({
    tool: r.tool_name, calls: Number(r.calls), errors: Number(r.errors),
  }))
}

export async function getSessionFilesTouched(sessionId: string, limit = 5) {
  const db = getDb()
  const rows = await db.execute<{ file: string; n: string }>(sql`
    SELECT input->>'file_path' AS file, COUNT(*)::int AS n
    FROM tool_calls
    WHERE session_id = ${sessionId}
      AND tool_name IN ('Read', 'Write', 'Edit', 'MultiEdit', 'NotebookEdit')
      AND input->>'file_path' IS NOT NULL
    GROUP BY input->>'file_path'
    ORDER BY n DESC
    LIMIT ${limit}
  `)
  const all = await db.execute<{ total: string }>(sql`
    SELECT COUNT(DISTINCT input->>'file_path')::int AS total
    FROM tool_calls
    WHERE session_id = ${sessionId}
      AND tool_name IN ('Read', 'Write', 'Edit', 'MultiEdit', 'NotebookEdit')
      AND input->>'file_path' IS NOT NULL
  `)
  const total = Number(((all as unknown as Array<{ total: string }>)[0])?.total ?? 0)
  const top = (rows as unknown as Array<{ file: string; n: string }>).map((r) => ({ file: r.file, n: Number(r.n) }))
  return { top, total }
}

export async function getSessionFirstPrompts(sessionId: string, limit = 3) {
  const db = getDb()
  const rows = await db.execute<{ ts: string; text: string }>(sql`
    SELECT timestamp::text AS ts, text_content AS text
    FROM messages
    WHERE session_id = ${sessionId}
      AND role = 'user'
      AND is_sidechain = false
      AND text_content IS NOT NULL
    ORDER BY timestamp ASC
    LIMIT ${limit}
  `)
  return (rows as unknown as Array<{ ts: string; text: string }>).map((r) => ({
    ts: new Date(r.ts).toISOString(),
    text: r.text.slice(0, 140),
  }))
}
```

- [ ] **Step 3: Create `apps/web/lib/queries/search.ts`**

The current FTS query lives inline in `apps/web/app/search/page.tsx`. Read that file first, lift the SQL into this module verbatim, then add a count helper. The `SearchQuery` interface adds `models` and `role` filters; if either is absent, the SQL fragment becomes empty.

```ts
import 'server-only'
import { getDb } from '../db'
import { sql } from 'drizzle-orm'

export interface SearchQuery {
  q: string
  project?: string
  since?: { start: Date; end: Date }
  models?: string[]
  role?: 'user' | 'assistant'
  limit?: number
  offset?: number
}

export async function ftsSearch(args: SearchQuery) {
  const db = getDb()
  const rows = await db.execute<{
    session_id: string; timestamp: string; role: string; project_path: string | null
    snippet: string; cost: string | null
  }>(sql`
    SELECT
      m.session_id,
      m.timestamp::text,
      m.role,
      s.project_path,
      ts_headline('english', m.text_content, plainto_tsquery('english', ${args.q}),
        'StartSel=<b>,StopSel=</b>,MaxWords=20,MinWords=10,MaxFragments=2,FragmentDelimiter=" … "') AS snippet,
      s.estimated_cost_usd::text AS cost
    FROM messages m
    JOIN sessions s ON s.session_id = m.session_id
    WHERE m.text_tsv @@ plainto_tsquery('english', ${args.q})
      ${args.role ? sql`AND m.role = ${args.role}` : sql``}
      ${args.project ? sql`AND s.project_path ILIKE ${'%' + args.project + '%'}` : sql``}
      ${args.since ? sql`AND m.timestamp >= ${args.since.start} AND m.timestamp <= ${args.since.end}` : sql``}
      ${args.models?.length ? sql`AND m.model = ANY(${args.models})` : sql``}
    ORDER BY ts_rank(m.text_tsv, plainto_tsquery('english', ${args.q})) DESC, m.timestamp DESC
    LIMIT ${args.limit ?? 50}
    OFFSET ${args.offset ?? 0}
  `)
  return (rows as unknown as Array<{
    session_id: string; timestamp: string; role: string; project_path: string | null
    snippet: string; cost: string | null
  }>).map((r) => ({
    sessionId: r.session_id,
    timestamp: new Date(r.timestamp).toISOString(),
    role: r.role,
    projectPath: r.project_path,
    snippet: r.snippet,
    cost: r.cost ? Number(r.cost) : null,
  }))
}

export async function countSearchResults(args: Omit<SearchQuery, 'limit' | 'offset'>): Promise<number> {
  const db = getDb()
  const rows = (await db.execute<{ c: string }>(sql`
    SELECT COUNT(*)::bigint AS c FROM messages m
    JOIN sessions s ON s.session_id = m.session_id
    WHERE m.text_tsv @@ plainto_tsquery('english', ${args.q})
      ${args.role ? sql`AND m.role = ${args.role}` : sql``}
      ${args.project ? sql`AND s.project_path ILIKE ${'%' + args.project + '%'}` : sql``}
      ${args.since ? sql`AND m.timestamp >= ${args.since.start} AND m.timestamp <= ${args.since.end}` : sql``}
      ${args.models?.length ? sql`AND m.model = ANY(${args.models})` : sql``}
  `)) as unknown as Array<{ c: string }>
  return Number(rows[0]?.c ?? 0)
}
```

- [ ] **Step 4: Update existing page imports temporarily to keep build green**

- `apps/web/app/page.tsx`: change `from '@/lib/queries'` → `from '@/lib/queries/sessions'` for `listSessions`.
- `apps/web/app/session/[id]/page.tsx`: change to `from '@/lib/queries/session'` for `getSessionMeta`, `getSessionEvents`, `getSessionToolCalls`.
- `apps/web/app/stats/page.tsx`: callers of `getTokensPerDay`/`getTopTools`/`getActivityByDay`/`getCostByProject` will be removed in Task 16. To keep the build green now, replace the entire file with this stub:
  ```tsx
  export default function Page() { return null }
  ```
- `apps/web/app/search/page.tsx`: refactor to import `ftsSearch` from `@/lib/queries/search` and inline-import the snippet renderer the same way it does today. Do not change rendering — only the import.

- [ ] **Step 5: Delete `apps/web/lib/queries.ts`**

```bash
rm apps/web/lib/queries.ts
```

- [ ] **Step 6: Build to confirm**

```bash
pnpm --filter @cca/web build 2>&1 | tail -20
pnpm --filter @cca/web typecheck
```
Expected: build + typecheck pass.

- [ ] **Step 7: Commit**

```bash
git add apps/web/lib/queries/ apps/web/app/page.tsx apps/web/app/session apps/web/app/search apps/web/app/stats
git rm apps/web/lib/queries.ts
git commit -m "refactor(web): split lib/queries.ts into per-route modules"
```

---

### Task 6: Cost queries module + tests

**Files:**
- Create: `apps/web/lib/queries/cost.ts`
- Create: `apps/web/lib/queries/cost.test.ts`

- [ ] **Step 1: Write the test file**

Create `apps/web/lib/queries/cost.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  getCostKpis,
  getSpendStackedByModel,
  getTopCostSessions,
  getCostDistribution,
  getCacheHitTrend,
  getActiveHoursHeatmap,
} from './cost'

const SINCE = { start: new Date('2026-04-01T00:00:00Z'), end: new Date('2026-04-26T23:59:59Z') }

describe('cost queries', () => {
  it('getCostKpis returns numeric fields', async () => {
    const k = await getCostKpis(SINCE)
    expect(k.todayCost).toBeGreaterThanOrEqual(0)
    expect(k.windowCost).toBeGreaterThanOrEqual(0)
    expect(k.cacheHitPct).toBeGreaterThanOrEqual(0)
    expect(k.cacheHitPct).toBeLessThanOrEqual(1)
    expect(k.activeSessions.count).toBeGreaterThanOrEqual(0)
  })

  it('getSpendStackedByModel returns one row per (day, model)', async () => {
    const rows = await getSpendStackedByModel(SINCE)
    expect(Array.isArray(rows)).toBe(true)
    if (rows.length) {
      expect(rows[0]).toHaveProperty('day')
      expect(rows[0]).toHaveProperty('model')
      expect(rows[0]).toHaveProperty('cost')
      expect(typeof rows[0].cost).toBe('number')
    }
  })

  it('getTopCostSessions returns up to 5 rows ordered DESC by cost', async () => {
    const rows = await getTopCostSessions(SINCE, 5)
    expect(rows.length).toBeLessThanOrEqual(5)
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i - 1].cost).toBeGreaterThanOrEqual(rows[i].cost)
    }
  })

  it('getCostDistribution returns p50/p95/p99/max', async () => {
    const d = await getCostDistribution(SINCE)
    expect(d).toHaveProperty('p50')
    expect(d).toHaveProperty('p95')
    expect(d).toHaveProperty('p99')
    expect(d).toHaveProperty('max')
    expect(d).toHaveProperty('count')
    expect(d.p99).toBeGreaterThanOrEqual(d.p95)
    expect(d.p95).toBeGreaterThanOrEqual(d.p50)
  })

  it('getCacheHitTrend returns one row per day', async () => {
    const rows = await getCacheHitTrend(SINCE)
    expect(Array.isArray(rows)).toBe(true)
    if (rows.length) {
      expect(rows[0]).toHaveProperty('day')
      expect(rows[0]).toHaveProperty('hitPct')
    }
  })

  it('getActiveHoursHeatmap returns 168 cells (24h x 7dow)', async () => {
    const heatmap = await getActiveHoursHeatmap(SINCE)
    expect(heatmap.cells).toHaveLength(7 * 24)
  })
})
```

- [ ] **Step 2: Run, expect fail**

```bash
pnpm --filter @cca/web test --run cost.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `cost.ts`**

Create `apps/web/lib/queries/cost.ts`:

```ts
import 'server-only'
import { getDb } from '../db'
import { sql } from 'drizzle-orm'

export interface Window { start: Date; end: Date }

export interface CostKpis {
  todayCost: number
  windowCost: number
  windowCostPriorPeriod: number
  cacheHitPct: number
  cacheHitPctPrior: number
  topModel: { model: string; pctOfCost: number } | null
  topModelPctPrior: number
  activeSessions: { count: number; sample: { sessionId: string; projectPath: string | null }[] }
}

function priorWindow(w: Window): Window {
  const len = w.end.getTime() - w.start.getTime()
  return { start: new Date(w.start.getTime() - len), end: w.start }
}

export async function getCostKpis(w: Window): Promise<CostKpis> {
  const db = getDb()
  const prior = priorWindow(w)
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)

  const costRows = await db.execute<{ today: string; window: string; window_prior: string }>(sql`
    SELECT
      COALESCE(SUM(estimated_cost_usd) FILTER (WHERE started_at >= ${todayStart}), 0)::float8 AS today,
      COALESCE(SUM(estimated_cost_usd) FILTER (WHERE started_at >= ${w.start} AND started_at <= ${w.end}), 0)::float8 AS window,
      COALESCE(SUM(estimated_cost_usd) FILTER (WHERE started_at >= ${prior.start} AND started_at <= ${prior.end}), 0)::float8 AS window_prior
    FROM sessions
  `) as unknown as Array<{ today: string; window: string; window_prior: string }>
  const cost = costRows[0]

  const cacheRows = await db.execute<{ in_tok: string; cache: string; in_tok_prior: string; cache_prior: string }>(sql`
    SELECT
      COALESCE(SUM(input_tokens) FILTER (WHERE day::date >= ${w.start.toISOString().slice(0,10)}::date AND day::date <= ${w.end.toISOString().slice(0,10)}::date), 0)::bigint AS in_tok,
      COALESCE(SUM(cache_read) FILTER (WHERE day::date >= ${w.start.toISOString().slice(0,10)}::date AND day::date <= ${w.end.toISOString().slice(0,10)}::date), 0)::bigint AS cache,
      COALESCE(SUM(input_tokens) FILTER (WHERE day::date >= ${prior.start.toISOString().slice(0,10)}::date AND day::date <= ${prior.end.toISOString().slice(0,10)}::date), 0)::bigint AS in_tok_prior,
      COALESCE(SUM(cache_read) FILTER (WHERE day::date >= ${prior.start.toISOString().slice(0,10)}::date AND day::date <= ${prior.end.toISOString().slice(0,10)}::date), 0)::bigint AS cache_prior
    FROM usage_daily
  `) as unknown as Array<{ in_tok: string; cache: string; in_tok_prior: string; cache_prior: string }>
  const cacheRow = cacheRows[0]

  const inTok = Number(cacheRow.in_tok); const cacheTok = Number(cacheRow.cache)
  const inTokPrior = Number(cacheRow.in_tok_prior); const cachePrior = Number(cacheRow.cache_prior)

  const modelRows = await db.execute<{ model: string | null; cost: string }>(sql`
    SELECT m.model, COALESCE(SUM(
      m.input_tokens * mp.input_per_mtok / 1e6
    + m.output_tokens * mp.output_per_mtok / 1e6
    + m.cache_creation_tokens * mp.cache_write_5m_per_mtok / 1e6
    + m.cache_read_tokens * mp.cache_read_per_mtok / 1e6
    ), 0)::float8 AS cost
    FROM messages m
    LEFT JOIN model_pricing mp ON mp.model = m.model
    WHERE m.role = 'assistant' AND m.timestamp >= ${w.start} AND m.timestamp <= ${w.end}
    GROUP BY m.model
    ORDER BY cost DESC
    LIMIT 5
  `) as unknown as Array<{ model: string | null; cost: string }>
  const totalModelCost = modelRows.reduce((s, r) => s + Number(r.cost), 0)
  const topModel = modelRows[0]?.model
    ? { model: modelRows[0].model!, pctOfCost: totalModelCost > 0 ? Number(modelRows[0].cost) / totalModelCost : 0 }
    : null

  const modelRowsPrior = await db.execute<{ model: string | null; cost: string }>(sql`
    SELECT m.model, COALESCE(SUM(
      m.input_tokens * mp.input_per_mtok / 1e6
    + m.output_tokens * mp.output_per_mtok / 1e6
    + m.cache_creation_tokens * mp.cache_write_5m_per_mtok / 1e6
    + m.cache_read_tokens * mp.cache_read_per_mtok / 1e6
    ), 0)::float8 AS cost
    FROM messages m
    LEFT JOIN model_pricing mp ON mp.model = m.model
    WHERE m.role = 'assistant' AND m.timestamp >= ${prior.start} AND m.timestamp <= ${prior.end}
    GROUP BY m.model
  `) as unknown as Array<{ model: string | null; cost: string }>
  const totalPriorCost = modelRowsPrior.reduce((s, r) => s + Number(r.cost), 0)
  const priorTopModel = topModel ? modelRowsPrior.find((r) => r.model === topModel.model) : undefined
  const topModelPctPrior = priorTopModel && totalPriorCost > 0 ? Number(priorTopModel.cost) / totalPriorCost : 0

  const active = await db.execute<{ session_id: string; project_path: string | null }>(sql`
    SELECT session_id, project_path FROM sessions WHERE status = 'active' ORDER BY started_at DESC LIMIT 3
  `) as unknown as Array<{ session_id: string; project_path: string | null }>

  return {
    todayCost: Number(cost.today),
    windowCost: Number(cost.window),
    windowCostPriorPeriod: Number(cost.window_prior),
    cacheHitPct: inTok + cacheTok > 0 ? cacheTok / (inTok + cacheTok) : 0,
    cacheHitPctPrior: inTokPrior + cachePrior > 0 ? cachePrior / (inTokPrior + cachePrior) : 0,
    topModel,
    topModelPctPrior,
    activeSessions: { count: active.length, sample: active.map((a) => ({ sessionId: a.session_id, projectPath: a.project_path })) },
  }
}

export async function getSpendStackedByModel(w: Window) {
  const db = getDb()
  const rows = await db.execute<{ day: string; model: string; cost: string }>(sql`
    SELECT u.day::text AS day, u.model, COALESCE(SUM(
      u.input_tokens * mp.input_per_mtok / 1e6
    + u.output_tokens * mp.output_per_mtok / 1e6
    + u.cache_creation * mp.cache_write_5m_per_mtok / 1e6
    + u.cache_read * mp.cache_read_per_mtok / 1e6
    ), 0)::float8 AS cost
    FROM usage_daily u
    LEFT JOIN model_pricing mp ON mp.model = u.model
    WHERE u.day::date >= ${w.start.toISOString().slice(0,10)}::date
      AND u.day::date <= ${w.end.toISOString().slice(0,10)}::date
    GROUP BY u.day, u.model
    ORDER BY u.day ASC
  `) as unknown as Array<{ day: string; model: string; cost: string }>
  return rows.map((r) => ({ day: r.day.slice(0, 10), model: r.model, cost: Number(r.cost) }))
}

export async function getTopCostSessions(w: Window, limit = 5) {
  const db = getDb()
  const rows = await db.execute<{
    session_id: string; project_path: string | null; started_at: string
    duration_sec: string | null; message_count: string | null
    models_used: string[] | null; cost: string | null
  }>(sql`
    SELECT session_id, project_path, started_at::text, duration_sec, message_count, models_used, estimated_cost_usd::float8::text AS cost
    FROM sessions
    WHERE started_at >= ${w.start} AND started_at <= ${w.end} AND estimated_cost_usd IS NOT NULL
    ORDER BY estimated_cost_usd DESC NULLS LAST
    LIMIT ${limit}
  `) as unknown as Array<{
    session_id: string; project_path: string | null; started_at: string
    duration_sec: string | null; message_count: string | null
    models_used: string[] | null; cost: string | null
  }>
  return rows.map((r) => ({
    sessionId: r.session_id, projectPath: r.project_path,
    startedAt: new Date(r.started_at).toISOString(),
    durationSec: Number(r.duration_sec ?? 0), messageCount: Number(r.message_count ?? 0),
    modelsUsed: r.models_used ?? [], cost: Number(r.cost ?? 0),
  }))
}

export async function getCostDistribution(w: Window) {
  const db = getDb()
  const rows = await db.execute<{ p50: string; p95: string; p99: string; max: string; n: string }>(sql`
    SELECT
      percentile_cont(0.5) WITHIN GROUP (ORDER BY estimated_cost_usd)::float8::text AS p50,
      percentile_cont(0.95) WITHIN GROUP (ORDER BY estimated_cost_usd)::float8::text AS p95,
      percentile_cont(0.99) WITHIN GROUP (ORDER BY estimated_cost_usd)::float8::text AS p99,
      MAX(estimated_cost_usd)::float8::text AS max,
      COUNT(*)::int AS n
    FROM sessions
    WHERE started_at >= ${w.start} AND started_at <= ${w.end} AND estimated_cost_usd IS NOT NULL
  `) as unknown as Array<{ p50: string; p95: string; p99: string; max: string; n: string }>
  const r = rows[0]
  return {
    p50: Number(r?.p50 ?? 0), p95: Number(r?.p95 ?? 0),
    p99: Number(r?.p99 ?? 0), max: Number(r?.max ?? 0), count: Number(r?.n ?? 0),
  }
}

export async function getCacheHitTrend(w: Window) {
  const db = getDb()
  const rows = await db.execute<{ day: string; hit_pct: string }>(sql`
    SELECT day::text AS day,
           CASE WHEN SUM(input_tokens + cache_read) > 0
                THEN SUM(cache_read)::float8 / SUM(input_tokens + cache_read)::float8
                ELSE 0 END::float8::text AS hit_pct
    FROM usage_daily
    WHERE day::date >= ${w.start.toISOString().slice(0,10)}::date
      AND day::date <= ${w.end.toISOString().slice(0,10)}::date
    GROUP BY day ORDER BY day ASC
  `) as unknown as Array<{ day: string; hit_pct: string }>
  return rows.map((r) => ({ day: r.day.slice(0, 10), hitPct: Number(r.hit_pct) }))
}

export async function getActiveHoursHeatmap(w: Window) {
  const minStart = new Date(Math.min(w.start.getTime(), Date.now() - 30 * 24 * 60 * 60 * 1000))
  const db = getDb()
  const rows = await db.execute<{ dow: string; h: string; n: string }>(sql`
    SELECT EXTRACT(dow FROM started_at AT TIME ZONE 'America/New_York')::int AS dow,
           EXTRACT(hour FROM started_at AT TIME ZONE 'America/New_York')::int AS h,
           COUNT(*)::int AS n
    FROM sessions
    WHERE started_at >= ${minStart} AND started_at <= ${w.end}
    GROUP BY 1, 2
  `) as unknown as Array<{ dow: string; h: string; n: string }>
  const grid: number[] = new Array(7 * 24).fill(0)
  for (const r of rows) grid[Number(r.dow) * 24 + Number(r.h)] = Number(r.n)
  return { cells: grid, windowStart: minStart, windowEnd: w.end, clamped: minStart < w.start }
}
```

- [ ] **Step 4: Run, expect pass**

```bash
pnpm --filter @cca/web test --run cost.test.ts
```
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

```bash
pnpm --filter @cca/web typecheck
git add apps/web/lib/queries/cost.ts apps/web/lib/queries/cost.test.ts
git commit -m "feat(web): cost queries (KPIs, stacked spend, top sessions, distribution, cache, heatmap)"
```

---

### Task 7: Briefing rule engine + tests

**Files:**
- Create: `apps/web/lib/briefing.ts`
- Create: `apps/web/lib/briefing.test.ts`

- [ ] **Step 1: Write the test**

Create `apps/web/lib/briefing.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { computeBriefing, renderBriefing } from './briefing'

describe('computeBriefing', () => {
  it('omits delta line when prior period has zero spend', () => {
    const b = computeBriefing({
      windowCost: 10, windowCostPriorPeriod: 0,
      cacheHitPct: 0.5, cacheHitPctPrior: 0.4,
      topProject: { project: 'foo', model: 'opus', cost: 7 },
      windowLabel: 'Last 7d', isPartialDay: false,
    })
    expect(b.lines[0]).toMatch(/\$10/)
    expect(b.lines[0]).not.toMatch(/vs prior/)
  })

  it('uses today so far label when partial day', () => {
    const b = computeBriefing({
      windowCost: 5, windowCostPriorPeriod: 4,
      cacheHitPct: 0.5, cacheHitPctPrior: 0.5,
      topProject: { project: 'foo', model: 'opus', cost: 3 },
      windowLabel: 'Today', isPartialDay: true,
    })
    expect(b.lines[0]).toMatch(/today so far/i)
  })

  it('emits dash for delta when prior data missing', () => {
    const b = computeBriefing({
      windowCost: 12, windowCostPriorPeriod: NaN,
      cacheHitPct: 0.5, cacheHitPctPrior: 0.5,
      topProject: { project: 'bar', model: 'sonnet', cost: 8 },
      windowLabel: 'Last 7d', isPartialDay: false,
    })
    expect(b.lines[0]).toMatch(/—/)
  })

  it('formats positive vs negative delta correctly', () => {
    const up = computeBriefing({
      windowCost: 100, windowCostPriorPeriod: 50,
      cacheHitPct: 0.5, cacheHitPctPrior: 0.5,
      topProject: { project: 'p', model: 'm', cost: 50 },
      windowLabel: 'Last 7d', isPartialDay: false,
    })
    expect(up.lines[0]).toMatch(/\+100%/)
    const down = computeBriefing({
      windowCost: 25, windowCostPriorPeriod: 50,
      cacheHitPct: 0.5, cacheHitPctPrior: 0.5,
      topProject: { project: 'p', model: 'm', cost: 12 },
      windowLabel: 'Last 7d', isPartialDay: false,
    })
    expect(down.lines[0]).toMatch(/−50%/)
  })

  it('renders to plain string', () => {
    const b = computeBriefing({
      windowCost: 100, windowCostPriorPeriod: 80,
      cacheHitPct: 0.31, cacheHitPctPrior: 0.52,
      topProject: { project: 'cca', model: 'opus', cost: 48 },
      windowLabel: 'Last 7d', isPartialDay: false,
    })
    const out = renderBriefing(b)
    expect(out).toMatch(/Burn/)
    expect(out).toMatch(/cca/)
    expect(out).toMatch(/Opus/)
  })
})
```

- [ ] **Step 2: Run, expect fail**

```bash
pnpm --filter @cca/web test --run briefing.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `briefing.ts`**

Create `apps/web/lib/briefing.ts`:

```ts
export interface BriefingInput {
  windowCost: number
  windowCostPriorPeriod: number
  cacheHitPct: number
  cacheHitPctPrior: number
  topProject: { project: string; model: string; cost: number } | null
  windowLabel: string
  isPartialDay: boolean
}

export interface Briefing { lines: string[] }

function fmtUsd(n: number): string {
  if (!Number.isFinite(n)) return '—'
  if (n < 0.01) return '$0.00'
  return `$${n.toFixed(2)}`
}

function fmtPct(n: number): string {
  if (!Number.isFinite(n)) return '—'
  return `${Math.round(n * 100)}%`
}

function fmtDeltaPct(curr: number, prior: number): string {
  if (!Number.isFinite(prior) || prior === 0) return '—'
  const pct = (curr - prior) / prior
  if (!Number.isFinite(pct)) return '—'
  const sign = pct >= 0 ? '+' : '−'
  return `${sign}${Math.round(Math.abs(pct) * 100)}%`
}

function fmtDeltaPp(curr: number, prior: number): string {
  if (!Number.isFinite(prior)) return '—'
  const pp = Math.round((curr - prior) * 100)
  if (pp === 0) return 'flat'
  const sign = pp >= 0 ? '+' : '−'
  return `${sign}${Math.abs(pp)}pp`
}

function modelDisplay(m: string): string {
  if (m.includes('opus')) return 'Opus'
  if (m.includes('sonnet')) return 'Sonnet'
  if (m.includes('haiku')) return 'Haiku'
  return m
}

export function computeBriefing(i: BriefingInput): Briefing {
  const lines: string[] = []
  const noun = i.isPartialDay ? 'today so far' : i.windowLabel.toLowerCase().replace(/^last /, '')
  if (Number.isFinite(i.windowCostPriorPeriod) && i.windowCostPriorPeriod > 0) {
    lines.push(`Burn ${fmtUsd(i.windowCost)} ${noun}, ${fmtDeltaPct(i.windowCost, i.windowCostPriorPeriod)} vs prior period.`)
  } else if (!Number.isFinite(i.windowCostPriorPeriod)) {
    lines.push(`Burn ${fmtUsd(i.windowCost)} ${noun} (vs prior: —).`)
  } else {
    lines.push(`Burn ${fmtUsd(i.windowCost)} ${noun}.`)
  }
  if (i.topProject) {
    lines.push(`Largest contributor: ${i.topProject.project} on ${modelDisplay(i.topProject.model)} (${fmtUsd(i.topProject.cost)}).`)
  }
  lines.push(`Cache hit ${fmtPct(i.cacheHitPct)} (${fmtDeltaPp(i.cacheHitPct, i.cacheHitPctPrior)} from prior).`)
  return { lines }
}

export function renderBriefing(b: Briefing): string {
  return b.lines.join('\n')
}
```

- [ ] **Step 4: Run, expect pass**

```bash
pnpm --filter @cca/web test --run briefing.test.ts
```
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

```bash
pnpm --filter @cca/web typecheck
git add apps/web/lib/briefing.ts apps/web/lib/briefing.test.ts
git commit -m "feat(web): rule-based briefing engine for cost home page"
```

---

### Task 8: Cost home components

**Files:**
- Create: `apps/web/components/cost/KpiStrip.tsx`
- Create: `apps/web/components/cost/BriefingCard.tsx`
- Create: `apps/web/components/cost/TopCostSessions.tsx`
- Create: `apps/web/components/cost/CostDistributionCard.tsx`
- Create: `apps/web/components/charts/StackedAreaSpend.tsx`
- Create: `apps/web/components/charts/CacheHitTrend.tsx`
- Create: `apps/web/components/charts/ActiveHoursHeatmap.tsx`

This task is large but each file is self-contained.

- [ ] **Step 1: KpiStrip**

```tsx
// apps/web/components/cost/KpiStrip.tsx
import type { CostKpis } from '@/lib/queries/cost'

function fmtUsd(n: number): string { return n < 0.01 ? '$0.00' : `$${n.toFixed(2)}` }

function deltaUsd(curr: number, prior: number): { text: string; cls: string } {
  if (!Number.isFinite(prior) || prior === 0) return { text: '—', cls: 'opacity-60' }
  const pct = (curr - prior) / prior
  const sign = pct >= 0 ? '+' : '−'
  const cls = pct >= 0 ? 'text-red-500' : 'text-green-500'
  return { text: `${sign}${Math.round(Math.abs(pct) * 100)}%`, cls }
}

function deltaPp(curr: number, prior: number): { text: string; cls: string } {
  if (!Number.isFinite(prior)) return { text: '—', cls: 'opacity-60' }
  const pp = Math.round((curr - prior) * 100)
  if (pp === 0) return { text: 'flat', cls: 'opacity-60' }
  const sign = pp >= 0 ? '+' : '−'
  const cls = pp >= 0 ? 'text-green-500' : 'text-red-500'
  return { text: `${sign}${Math.abs(pp)}pp`, cls }
}

export function KpiStrip({ kpis, todayPrior }: { kpis: CostKpis; todayPrior: number }) {
  const todayDelta = deltaUsd(kpis.todayCost, todayPrior)
  const winDelta = deltaUsd(kpis.windowCost, kpis.windowCostPriorPeriod)
  const cacheDelta = deltaPp(kpis.cacheHitPct, kpis.cacheHitPctPrior)
  const modelDelta = deltaPp(kpis.topModel?.pctOfCost ?? 0, kpis.topModelPctPrior)
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      <Cell label="Today" value={fmtUsd(kpis.todayCost)} delta={todayDelta} sub="vs yesterday" />
      <Cell label="Window" value={fmtUsd(kpis.windowCost)} delta={winDelta} sub="vs prior period" />
      <Cell label="Cache hit" value={`${Math.round(kpis.cacheHitPct * 100)}%`} delta={cacheDelta} sub="vs prior" />
      <Cell label="Top model"
        value={kpis.topModel ? kpis.topModel.model.replace(/^claude-/, '') : '—'}
        delta={modelDelta}
        sub={kpis.topModel ? `${Math.round(kpis.topModel.pctOfCost * 100)}% of cost` : ''} />
      <Cell label="Active sessions" value={String(kpis.activeSessions.count)}
        delta={{ text: '', cls: '' }}
        sub={kpis.activeSessions.sample
          .map((s) => s.projectPath?.replace(/^\/Users\/[^/]+\//, '~/') ?? s.sessionId.slice(0, 6))
          .join(' · ') || 'none'} />
    </div>
  )
}

function Cell({ label, value, delta, sub }: { label: string; value: string; delta: { text: string; cls: string }; sub: string }) {
  return (
    <div className="border border-border rounded-md p-3">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-2xl font-bold leading-tight">{value}</div>
      <div className="text-xs flex justify-between">
        {delta.text && <span className={delta.cls}>{delta.text}</span>}
        <span className="text-muted-foreground truncate">{sub}</span>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: BriefingCard**

```tsx
// apps/web/components/cost/BriefingCard.tsx
import type { Briefing } from '@/lib/briefing'

export function BriefingCard({ briefing }: { briefing: Briefing }) {
  return (
    <div className="border-l-4 border-green-500 bg-green-500/5 rounded-r-md p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Briefing</div>
      {briefing.lines.map((line, i) => (
        <p key={i} className="text-sm leading-relaxed">{line}</p>
      ))}
    </div>
  )
}
```

- [ ] **Step 3: TopCostSessions**

```tsx
// apps/web/components/cost/TopCostSessions.tsx
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'

interface Row {
  sessionId: string; projectPath: string | null; startedAt: string
  durationSec: number; messageCount: number; modelsUsed: string[]; cost: number
}

function shortProject(p: string | null): string {
  if (!p) return '(none)'
  return p.replace(/^\/Users\/[^/]+\//, '~/')
}

function modelChipClass(model: string): string {
  if (model.includes('opus')) return 'border-[hsl(var(--model-opus))] text-[hsl(var(--model-opus))]'
  if (model.includes('sonnet')) return 'border-[hsl(var(--model-sonnet))] text-[hsl(var(--model-sonnet))]'
  if (model.includes('haiku')) return 'border-[hsl(var(--model-haiku))] text-[hsl(var(--model-haiku))]'
  return ''
}

export function TopCostSessions({ rows }: { rows: Row[] }) {
  return (
    <div className="border border-border rounded-md p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Top-cost sessions</div>
      {rows.length === 0 && <div className="text-sm text-muted-foreground">No sessions in window.</div>}
      {rows.map((r) => (
        <Link key={r.sessionId} href={`/session/${r.sessionId}`}
          className="flex justify-between py-1.5 border-b border-border last:border-0 hover:bg-muted/30">
          <div className="text-sm flex flex-col">
            <span className="font-medium">{shortProject(r.projectPath)}</span>
            <span className="text-xs text-muted-foreground">
              {new Date(r.startedAt).toLocaleString()} · {r.messageCount} msgs ·{' '}
              {r.modelsUsed.map((m) => (
                <Badge key={m} variant="outline" className={`mr-1 ${modelChipClass(m)}`}>
                  {m.replace(/^claude-/, '').replace(/-\d+$/, '')}
                </Badge>
              ))}
            </span>
          </div>
          <div className="font-bold">${r.cost.toFixed(2)}</div>
        </Link>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: CostDistributionCard**

```tsx
// apps/web/components/cost/CostDistributionCard.tsx
export function CostDistributionCard({
  distribution,
}: {
  distribution: { p50: number; p95: number; p99: number; max: number; count: number }
}) {
  const rows = [
    ['P50', distribution.p50],
    ['P95', distribution.p95],
    ['P99', distribution.p99],
    ['Max', distribution.max],
  ] as const
  return (
    <div className="border border-border rounded-md p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Cost distribution</div>
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between py-1 border-b border-border last:border-0">
          <span className="text-sm text-muted-foreground">{k}</span>
          <span className="font-bold">${v.toFixed(2)}</span>
        </div>
      ))}
      <div className="flex justify-between pt-2 text-xs text-muted-foreground">
        <span>Sessions</span>
        <span>{distribution.count}</span>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: StackedAreaSpend (chart)**

```tsx
// apps/web/components/charts/StackedAreaSpend.tsx
'use client'

import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts'

interface Row { day: string; model: string; cost: number }

function modelHsl(model: string): string {
  if (model.includes('opus')) return 'hsl(var(--model-opus))'
  if (model.includes('sonnet')) return 'hsl(var(--model-sonnet))'
  if (model.includes('haiku')) return 'hsl(var(--model-haiku))'
  return 'hsl(var(--muted-foreground))'
}

export function StackedAreaSpend({ rows }: { rows: Row[] }) {
  const days = Array.from(new Set(rows.map((r) => r.day))).sort()
  const models = Array.from(new Set(rows.map((r) => r.model)))
  const data = days.map((day) => {
    const o: Record<string, number | string> = { day }
    for (const m of models) {
      const r = rows.find((x) => x.day === day && x.model === m)
      o[m] = r ? Number(r.cost.toFixed(4)) : 0
    }
    return o
  })
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
          <XAxis dataKey="day" tick={{ fontSize: 10 }} />
          <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `$${v}`} />
          <Tooltip formatter={(v: number) => `$${v.toFixed(2)}`} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {models.map((m) => (
            <Area key={m} type="monotone" dataKey={m} stackId="1"
              stroke={modelHsl(m)} fill={modelHsl(m)} fillOpacity={0.6}
              name={m.replace(/^claude-/, '').replace(/-\d+$/, '')} />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
```

- [ ] **Step 6: CacheHitTrend (chart)**

```tsx
// apps/web/components/charts/CacheHitTrend.tsx
'use client'

import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'

export function CacheHitTrend({ rows }: { rows: { day: string; hitPct: number }[] }) {
  const data = rows.map((r) => ({ day: r.day, pct: Math.round(r.hitPct * 100) }))
  return (
    <div className="border border-border rounded-md p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Cache hit rate · daily</div>
      <div className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis dataKey="day" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}%`} domain={[0, 100]} />
            <Tooltip formatter={(v: number) => `${v}%`} />
            <Line type="monotone" dataKey="pct" stroke="hsl(var(--model-haiku))" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
```

- [ ] **Step 7: ActiveHoursHeatmap**

```tsx
// apps/web/components/charts/ActiveHoursHeatmap.tsx
const DOWS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function ActiveHoursHeatmap({ data }: { data: { cells: number[]; clamped: boolean } }) {
  const max = Math.max(1, ...data.cells)
  return (
    <div className="border border-border rounded-md p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
        Active hours {data.clamped && <span className="opacity-70">(clamped to 30d)</span>}
      </div>
      <div className="grid" style={{ gridTemplateColumns: `auto repeat(24, 1fr)`, gap: 2 }}>
        <div></div>
        {Array.from({ length: 24 }, (_, h) => (
          <div key={h} className="text-[8px] text-center text-muted-foreground">{h % 6 === 0 ? h : ''}</div>
        ))}
        {DOWS.map((dow, dowIdx) => (
          <div key={dow} className="contents">
            <div className="text-[10px] text-muted-foreground pr-1 self-center">{dow}</div>
            {Array.from({ length: 24 }, (_, h) => {
              const v = data.cells[dowIdx * 24 + h]
              const intensity = v / max
              return (
                <div key={h} title={`${dow} ${h}:00 — ${v} sessions`}
                  className="rounded-sm"
                  style={{
                    background: `hsl(var(--model-sonnet) / ${0.08 + intensity * 0.85})`,
                    aspectRatio: '1',
                  }} />
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 8: Build to confirm**

```bash
pnpm --filter @cca/web build 2>&1 | tail -20
pnpm --filter @cca/web typecheck
```
Expected: build/typecheck pass. Components are not yet imported anywhere.

- [ ] **Step 9: Commit**

```bash
git add apps/web/components/cost apps/web/components/charts/StackedAreaSpend.tsx apps/web/components/charts/CacheHitTrend.tsx apps/web/components/charts/ActiveHoursHeatmap.tsx
git commit -m "feat(web): cost-home components and charts"
```

---

### Task 9: Wire `/` as Cost command center

**Files:**
- Modify: `apps/web/app/page.tsx`

- [ ] **Step 1: Replace `apps/web/app/page.tsx`**

```tsx
import { resolveSince } from '@/lib/since'
import {
  getCostKpis, getSpendStackedByModel, getTopCostSessions,
  getCostDistribution, getCacheHitTrend, getActiveHoursHeatmap,
} from '@/lib/queries/cost'
import { computeBriefing } from '@/lib/briefing'
import { KpiStrip } from '@/components/cost/KpiStrip'
import { BriefingCard } from '@/components/cost/BriefingCard'
import { TopCostSessions } from '@/components/cost/TopCostSessions'
import { CostDistributionCard } from '@/components/cost/CostDistributionCard'
import { StackedAreaSpend } from '@/components/charts/StackedAreaSpend'
import { CacheHitTrend } from '@/components/charts/CacheHitTrend'
import { ActiveHoursHeatmap } from '@/components/charts/ActiveHoursHeatmap'

export default async function CostHome({ searchParams }: { searchParams: Promise<{ since?: string }> }) {
  const sp = await searchParams
  const window = resolveSince(sp.since)
  const [kpis, spend, top, dist, cache, heatmap] = await Promise.all([
    getCostKpis(window),
    getSpendStackedByModel(window),
    getTopCostSessions(window, 5),
    getCostDistribution(window),
    getCacheHitTrend(window),
    getActiveHoursHeatmap(window),
  ])

  const yesterdayStart = new Date(); yesterdayStart.setHours(0, 0, 0, 0); yesterdayStart.setDate(yesterdayStart.getDate() - 1)
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
  const yesterdayKpis = await getCostKpis({ start: yesterdayStart, end: todayStart })

  const topProjectRow = top[0]
  const briefing = computeBriefing({
    windowCost: kpis.windowCost,
    windowCostPriorPeriod: kpis.windowCostPriorPeriod,
    cacheHitPct: kpis.cacheHitPct,
    cacheHitPctPrior: kpis.cacheHitPctPrior,
    topProject: topProjectRow ? {
      project: topProjectRow.projectPath?.replace(/^\/Users\/[^/]+\//, '~/') ?? '(none)',
      model: topProjectRow.modelsUsed[0] ?? '',
      cost: topProjectRow.cost,
    } : null,
    windowLabel: window.label,
    isPartialDay: sp.since === 'today' && new Date().getHours() < 6,
  })

  return (
    <div className="space-y-4">
      <KpiStrip kpis={kpis} todayPrior={yesterdayKpis.windowCost} />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 border border-border rounded-md p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
            Spend per day · stacked by model · {window.label}
          </div>
          <StackedAreaSpend rows={spend} />
        </div>
        <BriefingCard briefing={briefing} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2"><TopCostSessions rows={top} /></div>
        <CostDistributionCard distribution={dist} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <CacheHitTrend rows={cache} />
        <ActiveHoursHeatmap data={heatmap} />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Build and probe**

```bash
pnpm --filter @cca/web build 2>&1 | tail -10
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3939/
```
Expected: build OK; `/` returns 200. Open in browser; confirm KPI strip + chart + briefing + top sessions + distribution + cache trend + heatmap render.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/page.tsx
git commit -m "feat(web): / is now the cost command center"
```

---

### Task 10: Move sessions list to `/sessions` and polish filters

**Files:**
- Create: `apps/web/app/sessions/page.tsx`
- Modify: `apps/web/components/SessionFilters.tsx`

- [ ] **Step 1: Create `apps/web/app/sessions/page.tsx`**

```tsx
import { resolveSince } from '@/lib/since'
import { listSessions, countSessions } from '@/lib/queries/sessions'
import { SessionsTable } from '@/components/SessionsTable'
import { SessionFilters } from '@/components/SessionFilters'

export default async function SessionsPage({ searchParams }: {
  searchParams: Promise<{ project?: string; since?: string; model?: string; sort?: string; page?: string }>
}) {
  const sp = await searchParams
  const window = resolveSince(sp.since)
  const page = Math.max(1, Number(sp.page ?? 1))
  const limit = 50
  const offset = (page - 1) * limit
  const models = sp.model ? sp.model.split(',').filter(Boolean) : undefined
  const [rows, total] = await Promise.all([
    listSessions({ project: sp.project, since: window, models,
      sortBy: sp.sort === 'cost' ? 'cost' : 'recent', limit, offset }),
    countSessions({ project: sp.project, since: window, models }),
  ])
  return (
    <div className="space-y-4">
      <SessionFilters initial={{ project: sp.project ?? '', model: sp.model ?? '', sort: sp.sort ?? 'recent' }} />
      <SessionsTable rows={rows} />
      <Pagination page={page} total={total} limit={limit} sp={sp} />
    </div>
  )
}

function Pagination({ page, total, limit, sp }:
  { page: number; total: number; limit: number; sp: Record<string, string | undefined> }) {
  const last = Math.max(1, Math.ceil(total / limit))
  const buildHref = (p: number) => {
    const params = new URLSearchParams(Object.entries(sp).filter(([_, v]) => v) as [string, string][])
    params.set('page', String(p))
    return `?${params.toString()}`
  }
  return (
    <div className="flex justify-between text-sm">
      <span className="text-muted-foreground">{total} sessions</span>
      <div className="flex gap-2">
        {page > 1 && <a href={buildHref(page - 1)} className="hover:underline">← Prev</a>}
        <span>Page {page} / {last}</span>
        {page < last && <a href={buildHref(page + 1)} className="hover:underline">Next →</a>}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Update `SessionFilters.tsx`**

Replace `apps/web/components/SessionFilters.tsx`:

```tsx
'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'

const KNOWN_MODELS = [
  { value: 'claude-opus-4-7', label: 'Opus' },
  { value: 'claude-sonnet-4-6', label: 'Sonnet' },
  { value: 'claude-haiku-4-5-20251001', label: 'Haiku' },
]

export function SessionFilters({ initial }: { initial: { project: string; model: string; sort: string } }) {
  const router = useRouter()
  const sp = useSearchParams()
  const [project, setProject] = useState(initial.project)
  const [models, setModels] = useState<string[]>(initial.model ? initial.model.split(',').filter(Boolean) : [])
  const [sort, setSort] = useState<'recent' | 'cost'>(initial.sort === 'cost' ? 'cost' : 'recent')

  function apply() {
    const next = new URLSearchParams(sp.toString())
    if (project) next.set('project', project); else next.delete('project')
    if (models.length) next.set('model', models.join(',')); else next.delete('model')
    next.set('sort', sort)
    next.delete('page')
    router.push(`?${next.toString()}`)
  }
  function reset() { router.push('?') }

  return (
    <div className="flex flex-wrap gap-2 items-end border border-border rounded-md p-3">
      <label className="text-xs">
        <div className="text-muted-foreground">Project</div>
        <input type="text" value={project} onChange={(e) => setProject(e.target.value)}
          placeholder="substring match"
          className="px-2 py-1 rounded border border-border bg-background text-sm w-48" />
      </label>
      <div className="text-xs">
        <div className="text-muted-foreground">Models</div>
        <div className="flex gap-1">
          {KNOWN_MODELS.map((m) => {
            const on = models.includes(m.value)
            return (
              <button key={m.value} type="button"
                onClick={() => setModels(on ? models.filter((x) => x !== m.value) : [...models, m.value])}
                className={`px-2 py-1 rounded text-xs border ${on ? 'border-foreground bg-muted' : 'border-border opacity-70'}`}>
                {m.label}
              </button>
            )
          })}
        </div>
      </div>
      <div className="text-xs">
        <div className="text-muted-foreground">Sort</div>
        <button type="button" onClick={() => setSort(sort === 'recent' ? 'cost' : 'recent')}
          className="px-2 py-1 rounded text-xs border border-border">
          {sort === 'recent' ? 'Most recent' : 'Highest cost'}
        </button>
      </div>
      <button type="button" onClick={apply}
        className="ml-auto px-3 py-1.5 rounded border border-border text-sm hover:bg-muted/50">Apply</button>
      <button type="button" onClick={reset}
        className="px-3 py-1.5 rounded text-sm hover:bg-muted/50">Reset</button>
    </div>
  )
}
```

- [ ] **Step 3: Build, probe, commit**

```bash
pnpm --filter @cca/web build 2>&1 | tail -10
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3939/sessions
git add apps/web/app/sessions apps/web/components/SessionFilters.tsx
git commit -m "feat(web): move sessions list to /sessions; add model chips, cost sort, pagination"
```

---

### Task 11: Session detail outcomes components

**Files:**
- Create: `apps/web/components/session/StatsStrip.tsx`
- Create: `apps/web/components/session/TopToolsPanel.tsx`
- Create: `apps/web/components/session/FilesTouchedPanel.tsx`
- Create: `apps/web/components/session/CostSplitPanel.tsx`
- Create: `apps/web/components/session/FirstPromptsStrip.tsx`
- Create: `apps/web/components/session/CollapsibleReplay.tsx`

- [ ] **Step 1: StatsStrip**

```tsx
// apps/web/components/session/StatsStrip.tsx
export function StatsStrip({ cost, messages, toolCalls, toolErrors, cacheHitPct, subagents }:
  { cost: number; messages: number; toolCalls: number; toolErrors: number; cacheHitPct: number; subagents: number }) {
  const cells = [
    ['Cost', `$${cost.toFixed(2)}`],
    ['Messages', String(messages)],
    ['Tool calls', String(toolCalls)],
    ['Tool errors', String(toolErrors)],
    ['Cache hit', `${Math.round(cacheHitPct * 100)}%`],
    ['Subagents', String(subagents)],
  ] as const
  return (
    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
      {cells.map(([label, value]) => (
        <div key={label} className="border border-border rounded-md px-3 py-2">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
          <div className="text-lg font-bold">{value}</div>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: TopToolsPanel**

```tsx
// apps/web/components/session/TopToolsPanel.tsx
import { Badge } from '@/components/ui/badge'

export function TopToolsPanel({ rows }: { rows: { tool: string; calls: number; errors: number }[] }) {
  return (
    <div className="border border-border rounded-md p-3">
      <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Top tools</div>
      {rows.length === 0 && <div className="text-sm text-muted-foreground">No tool calls.</div>}
      {rows.map((r) => (
        <div key={r.tool} className="flex justify-between py-1 border-b border-border last:border-0 text-sm">
          <span>
            {r.tool}
            {r.errors > 0 && <Badge variant="outline" className="ml-2 border-red-500 text-red-500">{r.errors} err</Badge>}
          </span>
          <span className="font-bold">{r.calls}</span>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 3: FilesTouchedPanel**

```tsx
// apps/web/components/session/FilesTouchedPanel.tsx
export function FilesTouchedPanel({ data }: { data: { top: { file: string; n: number }[]; total: number } }) {
  return (
    <div className="border border-border rounded-md p-3">
      <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Files touched</div>
      {data.top.length === 0 && <div className="text-sm text-muted-foreground">No files touched.</div>}
      {data.top.map((r) => (
        <div key={r.file} className="flex justify-between py-1 border-b border-border last:border-0 text-sm">
          <span className="truncate">{r.file.replace(/^\/Users\/[^/]+\//, '~/')}</span>
          <span>{r.n}×</span>
        </div>
      ))}
      {data.total > data.top.length && (
        <div className="pt-1 text-xs text-muted-foreground">+ {data.total - data.top.length} more</div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: CostSplitPanel**

```tsx
// apps/web/components/session/CostSplitPanel.tsx
import { Badge } from '@/components/ui/badge'

function modelChipClass(model: string): string {
  if (model.includes('opus')) return 'border-[hsl(var(--model-opus))] text-[hsl(var(--model-opus))]'
  if (model.includes('sonnet')) return 'border-[hsl(var(--model-sonnet))] text-[hsl(var(--model-sonnet))]'
  if (model.includes('haiku')) return 'border-[hsl(var(--model-haiku))] text-[hsl(var(--model-haiku))]'
  return ''
}

export function CostSplitPanel({ costByModel, inputTokens, outputTokens, cacheReadTokens }:
  { costByModel: { model: string; cost: number }[]
    inputTokens: number; outputTokens: number; cacheReadTokens: number }) {
  const total = costByModel.reduce((s, x) => s + x.cost, 0)
  return (
    <div className="border border-border rounded-md p-3">
      <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Cost split</div>
      {costByModel.map((r) => (
        <div key={r.model} className="flex justify-between py-1 border-b border-border last:border-0 text-sm">
          <Badge variant="outline" className={modelChipClass(r.model)}>
            {r.model.replace(/^claude-/, '').replace(/-\d+$/, '')}
          </Badge>
          <span><b>${r.cost.toFixed(2)}</b> · {total > 0 ? Math.round((r.cost / total) * 100) : 0}%</span>
        </div>
      ))}
      <div className="pt-2 text-xs text-muted-foreground">Tokens (in/out/cache-read)</div>
      <div className="flex justify-between text-xs"><span>in</span><span>{inputTokens.toLocaleString()}</span></div>
      <div className="flex justify-between text-xs"><span>out</span><span>{outputTokens.toLocaleString()}</span></div>
      <div className="flex justify-between text-xs"><span>cache read</span><span>{cacheReadTokens.toLocaleString()}</span></div>
    </div>
  )
}
```

- [ ] **Step 5: FirstPromptsStrip**

```tsx
// apps/web/components/session/FirstPromptsStrip.tsx
export function FirstPromptsStrip({ rows }: { rows: { ts: string; text: string }[] }) {
  if (rows.length === 0) return null
  return (
    <div className="border border-border rounded-md p-3">
      <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">First prompts</div>
      {rows.map((r, i) => (
        <div key={i} className="flex gap-3 py-1 border-b border-border last:border-0 text-sm">
          <span className="text-muted-foreground text-xs">{new Date(r.ts).toLocaleTimeString()}</span>
          <span className="truncate">"{r.text}"</span>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 6: CollapsibleReplay**

```tsx
// apps/web/components/session/CollapsibleReplay.tsx
'use client'

import { useState } from 'react'

export function CollapsibleReplay({ initialOpen = false, count, children }:
  { initialOpen?: boolean; count: { messages: number; toolCalls: number }; children: React.ReactNode }) {
  const [open, setOpen] = useState(initialOpen)
  return (
    <div className="border border-border rounded-md">
      <button type="button" onClick={() => setOpen((o) => !o)}
        className="w-full text-left px-4 py-2 hover:bg-muted/30 text-sm flex items-center justify-between">
        <span>{open ? '▾' : '▸'} Replay timeline ({count.messages} messages, {count.toolCalls} tool calls)</span>
        <span className="text-xs text-muted-foreground">{open ? 'collapse' : 'expand'}</span>
      </button>
      {open && <div className="border-t border-border p-4">{children}</div>}
    </div>
  )
}
```

- [ ] **Step 7: Build + commit**

```bash
pnpm --filter @cca/web build 2>&1 | tail -10
pnpm --filter @cca/web typecheck
git add apps/web/components/session
git commit -m "feat(web): session outcomes components"
```

---

### Task 12: Session detail page assembly

**Files:**
- Modify: `apps/web/app/session/[id]/page.tsx`
- Create: `apps/web/lib/queries/session.test.ts`

- [ ] **Step 1: Write tests for the new session.ts helpers**

Create `apps/web/lib/queries/session.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { getDb } from '../db'
import { sql } from 'drizzle-orm'
import { getSessionStats, getSessionTopTools, getSessionFilesTouched, getSessionFirstPrompts } from './session'

async function pickSessionId(): Promise<string | null> {
  const db = getDb()
  const rows = await db.execute<{ session_id: string }>(sql`
    SELECT session_id FROM tool_calls GROUP BY session_id LIMIT 1
  `)
  return ((rows as unknown as Array<{ session_id: string }>)[0])?.session_id ?? null
}

describe('session queries', () => {
  it('getSessionStats returns numeric tokens and costByModel', async () => {
    const id = await pickSessionId()
    if (!id) return
    const s = await getSessionStats(id)
    expect(s.inputTokens).toBeGreaterThanOrEqual(0)
    expect(s.cacheHitPct).toBeGreaterThanOrEqual(0)
    expect(s.cacheHitPct).toBeLessThanOrEqual(1)
    expect(Array.isArray(s.costByModel)).toBe(true)
  })

  it('getSessionTopTools returns up to 5 rows', async () => {
    const id = await pickSessionId()
    if (!id) return
    const r = await getSessionTopTools(id, 5)
    expect(r.length).toBeLessThanOrEqual(5)
  })

  it('getSessionFilesTouched returns top + total', async () => {
    const id = await pickSessionId()
    if (!id) return
    const f = await getSessionFilesTouched(id, 5)
    expect(Array.isArray(f.top)).toBe(true)
    expect(typeof f.total).toBe('number')
  })

  it('getSessionFirstPrompts returns up to N rows', async () => {
    const id = await pickSessionId()
    if (!id) return
    const r = await getSessionFirstPrompts(id, 3)
    expect(r.length).toBeLessThanOrEqual(3)
  })
})
```

- [ ] **Step 2: Run, expect pass**

```bash
pnpm --filter @cca/web test --run session.test.ts
```
Expected: PASS.

- [ ] **Step 3: Replace `apps/web/app/session/[id]/page.tsx`**

```tsx
import {
  getSessionMeta, getSessionEvents, getSessionToolCalls,
  getSessionStats, getSessionTopTools, getSessionFilesTouched, getSessionFirstPrompts,
} from '@/lib/queries/session'
import { Badge } from '@/components/ui/badge'
import { EventRow } from '@/components/EventRow'
import { StatsStrip } from '@/components/session/StatsStrip'
import { TopToolsPanel } from '@/components/session/TopToolsPanel'
import { FilesTouchedPanel } from '@/components/session/FilesTouchedPanel'
import { CostSplitPanel } from '@/components/session/CostSplitPanel'
import { FirstPromptsStrip } from '@/components/session/FirstPromptsStrip'
import { CollapsibleReplay } from '@/components/session/CollapsibleReplay'
import Link from 'next/link'

function modelChipClass(model: string): string {
  if (model.includes('opus')) return 'border-[hsl(var(--model-opus))] text-[hsl(var(--model-opus))]'
  if (model.includes('sonnet')) return 'border-[hsl(var(--model-sonnet))] text-[hsl(var(--model-sonnet))]'
  if (model.includes('haiku')) return 'border-[hsl(var(--model-haiku))] text-[hsl(var(--model-haiku))]'
  return ''
}

function shortProject(p: string | null): string {
  return p ? p.replace(/^\/Users\/[^/]+\//, '~/') : '(none)'
}

export default async function SessionPage({ params, searchParams }: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ raw?: string; replay?: string }>
}) {
  const { id } = await params
  const sp = await searchParams
  const raw = sp.raw === '1'
  const replayOpen = sp.replay === '1'

  const meta = await getSessionMeta(id)
  if (!meta) return <div className="text-sm text-muted-foreground">Session not found.</div>

  const [stats, topTools, files, firstPrompts, events, toolCalls] = await Promise.all([
    getSessionStats(id),
    getSessionTopTools(id, 5),
    getSessionFilesTouched(id, 5),
    getSessionFirstPrompts(id, 3),
    getSessionEvents(id),
    getSessionToolCalls(id),
  ])

  const totalCost = stats.costByModel.reduce((s, r) => s + r.cost, 0)
  const toolErrorCount = topTools.reduce((s, r) => s + r.errors, 0)
  const startedAt = new Date(meta.startedAt!)
  const endedAt = meta.endedAt ? new Date(meta.endedAt) : null

  return (
    <div className="space-y-4">
      <div className="text-xs text-muted-foreground">
        <Link href="/sessions" className="hover:underline">/sessions</Link> / {id.slice(0, 8)}…
      </div>
      <div>
        <h1 className="text-xl font-bold">
          {shortProject(meta.projectPath)} · {startedAt.toLocaleString()}
          {endedAt && ` → ${endedAt.toLocaleString()}`} ({Math.round((meta.durationSec ?? 0) / 60)}m)
        </h1>
        <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
          {(meta.modelsUsed ?? []).map((m) => (
            <Badge key={m} variant="outline" className={modelChipClass(m)}>
              {m.replace(/^claude-/, '').replace(/-\d+$/, '')}
            </Badge>
          ))}
          {meta.gitBranch && <span>· {meta.gitBranch}</span>}
          {meta.ccVersion && <span>· cca-v{meta.ccVersion}</span>}
          <Link
            href={`?${raw ? '' : 'raw=1'}${replayOpen ? `${raw ? '?' : '&'}replay=1` : ''}`}
            className="ml-auto hover:underline"
          >
            {raw ? 'redact' : '?raw=1'}
          </Link>
        </div>
      </div>

      <StatsStrip
        cost={totalCost}
        messages={meta.messageCount ?? 0}
        toolCalls={meta.toolCallCount ?? 0}
        toolErrors={toolErrorCount}
        cacheHitPct={stats.cacheHitPct}
        subagents={meta.subagentCount ?? 0}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <TopToolsPanel rows={topTools} />
        <FilesTouchedPanel data={files} />
        <CostSplitPanel
          costByModel={stats.costByModel}
          inputTokens={stats.inputTokens}
          outputTokens={stats.outputTokens}
          cacheReadTokens={stats.cacheReadTokens}
        />
      </div>

      <FirstPromptsStrip rows={firstPrompts} />

      <CollapsibleReplay
        initialOpen={replayOpen}
        count={{ messages: meta.messageCount ?? 0, toolCalls: meta.toolCallCount ?? 0 }}
      >
        <div className="space-y-2">
          {events.map((e) => (
            <EventRow key={e.uuid} event={e} toolCalls={toolCalls.filter((tc) => tc.eventUuid === e.uuid)} raw={raw} />
          ))}
        </div>
      </CollapsibleReplay>
    </div>
  )
}
```

- [ ] **Step 4: Smoke test**

```bash
pnpm --filter @cca/web build 2>&1 | tail -10
SID=$(PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d claude_code -At -c "SELECT session_id FROM sessions ORDER BY estimated_cost_usd DESC NULLS LAST LIMIT 1")
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3939/session/${SID}"
```
Expected: `200`. Open in browser; verify outcomes summary visible above the fold; replay collapsed; click expand → events appear; `?raw=1` toggle works.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/session apps/web/lib/queries/session.test.ts
git commit -m "feat(web): session detail leads with outcomes; replay collapsed by default"
```

---

### Task 13: Search polish

**Files:**
- Modify: `apps/web/app/search/page.tsx`
- Modify: `apps/web/components/SearchForm.tsx`

The search page already renders snippets with the existing pattern. Preserve that rendering verbatim — only the query and surrounding controls change.

- [ ] **Step 1: Open `apps/web/app/search/page.tsx`**

Read the current file to capture the exact JSX line that renders each result row's snippet (the line that uses `applyRedaction(...)` on `r.snippet`). You will copy that line into the new page unchanged.

- [ ] **Step 2: Replace `apps/web/app/search/page.tsx` with the version below**

The placeholder line `<SNIPPET_RENDER_LINE/>` below stands for "the existing snippet-rendering JSX from the current file" — copy the exact existing line over it. Do NOT introduce any new HTML-insertion technique. Keep `applyRedaction` exactly where it is.

```tsx
import { ftsSearch, countSearchResults } from '@/lib/queries/search'
import { resolveSince } from '@/lib/since'
import { SearchForm } from '@/components/SearchForm'
import { applyRedaction } from '@/lib/redaction'
import Link from 'next/link'

export default async function SearchPage({ searchParams }: {
  searchParams: Promise<{ q?: string; project?: string; since?: string; model?: string; role?: string; page?: string }>
}) {
  const sp = await searchParams
  const q = sp.q ?? ''
  const window = resolveSince(sp.since)
  const role = sp.role === 'user' || sp.role === 'assistant' ? sp.role : undefined
  const models = sp.model ? sp.model.split(',').filter(Boolean) : undefined
  const page = Math.max(1, Number(sp.page ?? 1))
  const limit = 50
  const offset = (page - 1) * limit

  const args = { q, project: sp.project, since: window, models, role, limit, offset }
  const [rows, total] = q
    ? await Promise.all([ftsSearch(args), countSearchResults(args)])
    : [[], 0]

  const last = Math.max(1, Math.ceil(total / limit))

  return (
    <div className="space-y-4">
      <SearchForm initial={{ q, project: sp.project ?? '', model: sp.model ?? '', role: role ?? '' }} />
      {q && (
        <div className="text-xs text-muted-foreground">
          {total} results · page {page} / {last}
        </div>
      )}
      <div className="space-y-2">
        {rows.map((r, i) => (
          <Link key={`${r.sessionId}-${i}`} href={`/session/${r.sessionId}`}
            className="block border border-border rounded-md p-3 hover:bg-muted/30">
            <div className="text-xs text-muted-foreground flex justify-between">
              <span>
                {new Date(r.timestamp).toLocaleString()} · {r.role} ·{' '}
                {r.projectPath?.replace(/^\/Users\/[^/]+\//, '~/') ?? '(none)'}
              </span>
              {r.cost !== null && <span>${r.cost.toFixed(2)}</span>}
            </div>
            {/* SNIPPET_RENDER_LINE — copy the existing snippet-rendering JSX from the previous version of this file verbatim. It uses applyRedaction(r.snippet) and the existing render pattern; do not change it. */}
          </Link>
        ))}
      </div>
      {q && total > limit && (
        <div className="flex justify-center gap-3 text-sm">
          {page > 1 && <a href={`?${buildQs(sp, page - 1)}`} className="hover:underline">← Prev</a>}
          {page < last && <a href={`?${buildQs(sp, page + 1)}`} className="hover:underline">Next →</a>}
        </div>
      )}
    </div>
  )
}

function buildQs(sp: Record<string, string | undefined>, page: number): string {
  const p = new URLSearchParams(Object.entries(sp).filter(([_, v]) => v) as [string, string][])
  p.set('page', String(page))
  return p.toString()
}
```

- [ ] **Step 3: Update `SearchForm.tsx` to add model + role chips**

Read the existing `apps/web/components/SearchForm.tsx`, then add chip-style model + role selectors that write `?model=` and `?role=` alongside `?q=`. Pattern matches the new `SessionFilters.tsx` from Task 10. Keep the existing `q` input and submit handling.

- [ ] **Step 4: Build + commit**

```bash
pnpm --filter @cca/web build 2>&1 | tail -10
git add apps/web/app/search apps/web/components/SearchForm.tsx
git commit -m "feat(web): search adds model+role chips, cost dot per result, real pagination"
```

---

### Task 14: Behavior queries

**Files:**
- Create: `apps/web/lib/queries/behavior.ts`
- Create: `apps/web/lib/queries/behavior.test.ts`

- [ ] **Step 1: Write tests**

Create `apps/web/lib/queries/behavior.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  getToolErrorRateTrend, getLatencyPercentiles, getSubagentHistogram,
  getTokenVelocity, getCacheHitByModel,
} from './behavior'

const W = { start: new Date('2026-04-01T00:00:00Z'), end: new Date('2026-04-26T23:59:59Z') }

describe('behavior queries', () => {
  it('getToolErrorRateTrend returns per-day rows', async () => {
    const r = await getToolErrorRateTrend(W)
    expect(Array.isArray(r)).toBe(true)
  })
  it('getLatencyPercentiles returns p50/p95 per day', async () => {
    const r = await getLatencyPercentiles(W)
    expect(Array.isArray(r)).toBe(true)
    if (r.length) {
      expect(r[0]).toHaveProperty('p50Sec')
      expect(r[0]).toHaveProperty('p95Sec')
    }
  })
  it('getSubagentHistogram returns up to 7 buckets', async () => {
    const r = await getSubagentHistogram(W)
    expect(r.length).toBeLessThanOrEqual(7)
  })
  it('getTokenVelocity returns per-session points', async () => {
    const r = await getTokenVelocity(W)
    expect(Array.isArray(r)).toBe(true)
  })
  it('getCacheHitByModel returns one row per model', async () => {
    const r = await getCacheHitByModel(W)
    expect(Array.isArray(r)).toBe(true)
  })
})
```

- [ ] **Step 2: Run, expect fail**

```bash
pnpm --filter @cca/web test --run behavior.test.ts
```

- [ ] **Step 3: Implement `behavior.ts`**

```ts
// apps/web/lib/queries/behavior.ts
import 'server-only'
import { getDb } from '../db'
import { sql } from 'drizzle-orm'

interface Window { start: Date; end: Date }

export async function getToolErrorRateTrend(w: Window) {
  const db = getDb()
  const rows = await db.execute<{ day: string; calls: string; errors: string }>(sql`
    SELECT date_trunc('day', timestamp)::date::text AS day,
           COUNT(*)::int AS calls,
           COUNT(*) FILTER (WHERE is_error)::int AS errors
    FROM tool_calls
    WHERE timestamp >= ${w.start} AND timestamp <= ${w.end}
    GROUP BY 1 ORDER BY 1 ASC
  `) as unknown as Array<{ day: string; calls: string; errors: string }>
  return rows.map((r) => ({
    day: r.day.slice(0, 10),
    calls: Number(r.calls),
    errors: Number(r.errors),
    errorRate: Number(r.calls) > 0 ? Number(r.errors) / Number(r.calls) : 0,
  }))
}

export async function getLatencyPercentiles(w: Window) {
  const db = getDb()
  const rows = await db.execute<{ day: string; p50: string; p95: string }>(sql`
    WITH pairs AS (
      SELECT
        date_trunc('day', timestamp)::date AS day,
        EXTRACT(EPOCH FROM (
          LEAD(timestamp) OVER (PARTITION BY session_id ORDER BY timestamp) - timestamp
        )) AS gap,
        role,
        LEAD(role) OVER (PARTITION BY session_id ORDER BY timestamp) AS next_role
      FROM messages
      WHERE timestamp >= ${w.start} AND timestamp <= ${w.end}
        AND is_sidechain = false
    )
    SELECT day::text, percentile_cont(0.5) WITHIN GROUP (ORDER BY gap)::float8::text AS p50,
           percentile_cont(0.95) WITHIN GROUP (ORDER BY gap)::float8::text AS p95
    FROM pairs
    WHERE role = 'user' AND next_role = 'assistant' AND gap IS NOT NULL AND gap < 600
    GROUP BY day ORDER BY day ASC
  `) as unknown as Array<{ day: string; p50: string; p95: string }>
  return rows.map((r) => ({ day: r.day.slice(0, 10), p50Sec: Number(r.p50), p95Sec: Number(r.p95) }))
}

export async function getSubagentHistogram(w: Window) {
  const db = getDb()
  const rows = await db.execute<{ bucket: string; n: string }>(sql`
    SELECT LEAST(subagent_count, 6)::int AS bucket, COUNT(*)::int AS n
    FROM sessions
    WHERE started_at >= ${w.start} AND started_at <= ${w.end} AND subagent_count IS NOT NULL
    GROUP BY 1 ORDER BY 1 ASC
  `) as unknown as Array<{ bucket: string; n: string }>
  return rows.map((r) => ({ bucket: Number(r.bucket), count: Number(r.n) }))
}

export async function getTokenVelocity(w: Window) {
  const db = getDb()
  const rows = await db.execute<{ session_id: string; started_at: string; vel: string; cost: string | null }>(sql`
    SELECT session_id, started_at::text,
           CASE WHEN duration_sec > 0
                THEN ((total_input_tokens + total_output_tokens)::float8 / duration_sec)
                ELSE 0 END::float8::text AS vel,
           estimated_cost_usd::float8::text AS cost
    FROM sessions
    WHERE started_at >= ${w.start} AND started_at <= ${w.end}
      AND duration_sec IS NOT NULL AND duration_sec > 0
    ORDER BY started_at ASC
  `) as unknown as Array<{ session_id: string; started_at: string; vel: string; cost: string | null }>
  return rows.map((r) => ({
    sessionId: r.session_id,
    startedAt: new Date(r.started_at).toISOString(),
    tokensPerSec: Number(r.vel),
    cost: r.cost ? Number(r.cost) : null,
  }))
}

export async function getCacheHitByModel(w: Window) {
  const db = getDb()
  const rows = await db.execute<{ model: string | null; hit: string }>(sql`
    SELECT model,
           CASE WHEN SUM(input_tokens + cache_read_tokens) > 0
                THEN SUM(cache_read_tokens)::float8 / SUM(input_tokens + cache_read_tokens)::float8
                ELSE 0 END::float8::text AS hit
    FROM messages
    WHERE timestamp >= ${w.start} AND timestamp <= ${w.end}
      AND role = 'assistant' AND model IS NOT NULL
    GROUP BY model ORDER BY hit DESC
  `) as unknown as Array<{ model: string | null; hit: string }>
  return rows.map((r) => ({ model: r.model ?? '(none)', hitPct: Number(r.hit) }))
}
```

- [ ] **Step 4: Run, expect pass**

```bash
pnpm --filter @cca/web test --run behavior.test.ts
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
pnpm --filter @cca/web typecheck
git add apps/web/lib/queries/behavior.ts apps/web/lib/queries/behavior.test.ts
git commit -m "feat(web): behavior queries (error trend, latency, histogram, velocity, cache by model)"
```

---

### Task 15: Behavior charts

**Files:**
- Create: `apps/web/components/charts/ToolErrorRateTrend.tsx`
- Create: `apps/web/components/charts/LatencyPercentiles.tsx`
- Create: `apps/web/components/charts/SubagentHistogram.tsx`
- Create: `apps/web/components/charts/TokenVelocityScatter.tsx`

- [ ] **Step 1: ToolErrorRateTrend**

```tsx
// apps/web/components/charts/ToolErrorRateTrend.tsx
'use client'

import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'

export function ToolErrorRateTrend({ rows }: { rows: { day: string; errorRate: number }[] }) {
  const data = rows.map((r) => ({ day: r.day, pct: Math.round(r.errorRate * 1000) / 10 }))
  return (
    <div className="border border-border rounded-md p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Tool error rate · daily</div>
      <div className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis dataKey="day" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}%`} />
            <Tooltip formatter={(v: number) => `${v}%`} />
            <Line type="monotone" dataKey="pct" stroke="#ef4444" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: LatencyPercentiles**

```tsx
// apps/web/components/charts/LatencyPercentiles.tsx
'use client'

import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts'

export function LatencyPercentiles({ rows }: { rows: { day: string; p50Sec: number; p95Sec: number }[] }) {
  return (
    <div className="border border-border rounded-md p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Prompt → response latency</div>
      <div className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis dataKey="day" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}s`} />
            <Tooltip formatter={(v: number) => `${v.toFixed(2)}s`} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line type="monotone" dataKey="p50Sec" stroke="hsl(var(--model-haiku))" name="P50" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="p95Sec" stroke="hsl(var(--model-opus))" name="P95" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: SubagentHistogram**

```tsx
// apps/web/components/charts/SubagentHistogram.tsx
'use client'

import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'

export function SubagentHistogram({ rows }: { rows: { bucket: number; count: number }[] }) {
  const data = Array.from({ length: 7 }, (_, i) => ({
    bucket: i === 6 ? '6+' : String(i),
    count: rows.find((r) => r.bucket === i)?.count ?? 0,
  }))
  return (
    <div className="border border-border rounded-md p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Subagent depth</div>
      <div className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis dataKey="bucket" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip />
            <Bar dataKey="count" fill="hsl(var(--model-opus))" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: TokenVelocityScatter**

```tsx
// apps/web/components/charts/TokenVelocityScatter.tsx
'use client'

import { ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'

export function TokenVelocityScatter({ rows }: { rows: { startedAt: string; tokensPerSec: number; cost: number | null }[] }) {
  const data = rows.map((r) => ({
    x: new Date(r.startedAt).getTime(),
    y: r.tokensPerSec,
    cost: r.cost ?? 0,
  }))
  return (
    <div className="border border-border rounded-md p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Token velocity</div>
      <div className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart>
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis dataKey="x" type="number" domain={['auto', 'auto']} tick={{ fontSize: 10 }}
              tickFormatter={(t) => new Date(t).toISOString().slice(5, 10)} />
            <YAxis dataKey="y" tick={{ fontSize: 10 }} tickFormatter={(v) => `${Math.round(v)}t/s`} />
            <Tooltip formatter={(v: number) => `${v.toFixed(2)} t/s`} />
            <Scatter data={data} fill="hsl(var(--model-sonnet))" />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Build + commit**

```bash
pnpm --filter @cca/web build 2>&1 | tail -10
git add apps/web/components/charts/ToolErrorRateTrend.tsx apps/web/components/charts/LatencyPercentiles.tsx apps/web/components/charts/SubagentHistogram.tsx apps/web/components/charts/TokenVelocityScatter.tsx
git commit -m "feat(web): behavior charts (error trend, latency, subagent histogram, token velocity)"
```

---

### Task 16: Behavior page assembly

**Files:**
- Modify: `apps/web/app/stats/page.tsx`
- Delete: `apps/web/components/charts/ActivityHeatmap.tsx`, `apps/web/components/charts/CostByProject.tsx`, `apps/web/components/charts/TokensOverTime.tsx`, `apps/web/components/charts/TopTools.tsx`

- [ ] **Step 1: Replace `apps/web/app/stats/page.tsx`**

```tsx
import { resolveSince } from '@/lib/since'
import {
  getToolErrorRateTrend, getLatencyPercentiles,
  getSubagentHistogram, getTokenVelocity, getCacheHitByModel,
} from '@/lib/queries/behavior'
import { ToolErrorRateTrend } from '@/components/charts/ToolErrorRateTrend'
import { LatencyPercentiles } from '@/components/charts/LatencyPercentiles'
import { SubagentHistogram } from '@/components/charts/SubagentHistogram'
import { TokenVelocityScatter } from '@/components/charts/TokenVelocityScatter'
import { Badge } from '@/components/ui/badge'

function modelChipClass(model: string): string {
  if (model.includes('opus')) return 'border-[hsl(var(--model-opus))] text-[hsl(var(--model-opus))]'
  if (model.includes('sonnet')) return 'border-[hsl(var(--model-sonnet))] text-[hsl(var(--model-sonnet))]'
  if (model.includes('haiku')) return 'border-[hsl(var(--model-haiku))] text-[hsl(var(--model-haiku))]'
  return ''
}

export default async function BehaviorPage({ searchParams }: { searchParams: Promise<{ since?: string }> }) {
  const sp = await searchParams
  const window = resolveSince(sp.since)
  const [errors, latency, subagents, velocity, cacheByModel] = await Promise.all([
    getToolErrorRateTrend(window),
    getLatencyPercentiles(window),
    getSubagentHistogram(window),
    getTokenVelocity(window),
    getCacheHitByModel(window),
  ])
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Behavior · {window.label}</h1>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ToolErrorRateTrend rows={errors} />
        <LatencyPercentiles rows={latency} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SubagentHistogram rows={subagents} />
        <div className="border border-border rounded-md p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Cache hit % by model</div>
          {cacheByModel.length === 0 && <div className="text-sm text-muted-foreground">No data.</div>}
          {cacheByModel.map((r) => (
            <div key={r.model} className="flex justify-between py-1 border-b border-border last:border-0 text-sm">
              <Badge variant="outline" className={modelChipClass(r.model)}>
                {r.model.replace(/^claude-/, '').replace(/-\d+$/, '')}
              </Badge>
              <span className="font-bold">{Math.round(r.hitPct * 100)}%</span>
            </div>
          ))}
        </div>
      </div>
      <TokenVelocityScatter rows={velocity} />
    </div>
  )
}
```

- [ ] **Step 2: Remove old chart files**

```bash
git rm apps/web/components/charts/ActivityHeatmap.tsx
git rm apps/web/components/charts/CostByProject.tsx
git rm apps/web/components/charts/TokensOverTime.tsx
git rm apps/web/components/charts/TopTools.tsx
```

- [ ] **Step 3: Build, smoke**

```bash
pnpm --filter @cca/web build 2>&1 | tail -10
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3939/stats
```
Expected: 200. Browser shows tool error trend, latency, subagent histogram, cache by model, token velocity.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/stats
git commit -m "feat(web): /stats becomes Behavior page"
```

---

### Task 17: End-to-end smoke + regression sweep

**Files:** none (verification only).

- [ ] **Step 1: Restart the web dev server cleanly**

```bash
pkill -f "next dev .*-p 3939" || true
sleep 2
nohup pnpm --filter @cca/web dev >> ~/Library/Logs/cca/web.log 2>&1 &
disown
sleep 6
```

- [ ] **Step 2: HTTP-probe every route**

```bash
for path in / /sessions /search /stats; do
  echo "GET $path -> $(curl -s -o /dev/null -w "%{http_code}" "http://localhost:3939$path")"
done
SID=$(PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d claude_code -At -c "SELECT session_id FROM sessions ORDER BY started_at DESC LIMIT 1")
echo "GET /session/$SID -> $(curl -s -o /dev/null -w "%{http_code}" "http://localhost:3939/session/$SID")"
echo "GET /search?q=postgres -> $(curl -s -o /dev/null -w "%{http_code}" "http://localhost:3939/search?q=postgres")"
echo "GET /?since=30d -> $(curl -s -o /dev/null -w "%{http_code}" "http://localhost:3939/?since=30d")"
echo "GET /?since=2026-04-01..2026-04-15 -> $(curl -s -o /dev/null -w "%{http_code}" "http://localhost:3939/?since=2026-04-01..2026-04-15")"
```
Expected: every probe returns `200`. If any returns 500, open the web log (`tail -50 ~/Library/Logs/cca/web.log`) to find the offending query and fix.

- [ ] **Step 3: Manual visual check**

Open `http://localhost:3939/` in a browser. Visit each tab. Confirm:
- Time picker visible in nav, default "Last 7d", changing it updates URL and the data.
- KPI strip on `/` has 5 cells, deltas color-coded.
- Briefing card text is non-fabricated (matches numbers above).
- Stacked area chart legend shows 1-3 model names, color-coded.
- Top-cost sessions link to `/session/:id` correctly; outcomes summary visible above the fold.
- Replay timeline collapsed by default; expand toggles `?replay=1`.
- `/stats` (Behavior) renders four charts + cache-by-model table.
- Live indicator dot still visible (and green if daemon up).

- [ ] **Step 4: Run all tests, full typecheck**

```bash
pnpm test
pnpm typecheck
```
Expected: all green.

- [ ] **Step 5: Each regression fix gets its own commit**

`fix(web): <what>` per fix.

---

### Task 18: Update STATUS.md and README; merge

**Files:**
- Modify: `STATUS.md`
- Modify: `README.md`

- [ ] **Step 1: Append a new section to STATUS.md**

After the existing "Plan 3 (Web UI) complete" section:

```markdown

---

## 2026-04-26 — Dashboard redesign complete

Branch: `feat/dashboard-redesign`. ~18 commits.

### What was built

- New IA: `/` is now a **cost command center**; sessions list moved to `/sessions`; `/stats` renamed **Behavior** in nav.
- **Global time picker** in nav (Today / 7d / 30d / 90d / All / Custom). URL + cookie persistence; default 7d.
- Home page composition: 5-cell KPI strip · stacked-area spend by model · rule-based briefing · top-cost sessions · cost distribution P50/P95/P99 · cache hit trend · 24×7 active-hours heatmap.
- Session detail leads with **outcomes summary** (6-cell stat strip · top tools w/ error chip · files touched · cost split by model · first prompts) above a **collapsible replay** timeline.
- Behavior page: tool error rate trend · latency P50/P95 · subagent histogram · token velocity scatter · cache hit by model.
- New per-route query modules in `apps/web/lib/queries/{cost,sessions,session,search,behavior}.ts`. Old monolithic `lib/queries.ts` removed.
- New `apps/web/lib/briefing.ts` rule engine (no LLM call).
- Three model color tokens in `globals.css` so chips/legends agree everywhere.

### What this redesign deliberately did NOT do

- No DB schema changes, no new mat-views.
- No auth, sharing, or per-user breakdowns (designed-as-if-org but single-user in v1).
- No settings page, no annotations, no exports.
- No pixel-snapshot tests (RTL + real DB only).
```

- [ ] **Step 2: Update README "Web UI" section**

Replace the bullets under "## Web UI" in `README.md`:

```markdown
## Web UI

`http://localhost:3939` — five views with a global time picker in the nav:

- `/` — **Cost command center**: KPI strip, stacked-area spend by model, briefing card, top-cost sessions, cost distribution, cache hit trend, hour×day-of-week heatmap.
- `/sessions` — paginated sessions list with project/model filters and recent/cost sort.
- `/session/<uuid>` — outcomes summary (cost, tools, files, models) above a collapsible replay; `?raw=1` shows unredacted content.
- `/search?q=...` — full-text search with project/model/role chips, cost-per-result, and pagination.
- `/stats` — **Behavior**: tool error rate, prompt→response latency P50/P95, subagent histogram, token velocity, cache hit by model.

The header shows a live-activity indicator driven by the daemon's SSE stream (`http://localhost:9939/events`).
```

- [ ] **Step 3: Commit + merge**

```bash
git add STATUS.md README.md
git commit -m "chore: STATUS + README cover dashboard redesign"
git checkout main
git merge --ff-only feat/dashboard-redesign
git log --oneline -5
```
Expected: fast-forward merge succeeds; `feat/dashboard-redesign` is fully merged into `main`.

---

## Self-review notes

- **Spec coverage:**
  - §1 Goal → Tasks 1–18 collectively replace the dashboard.
  - §2 Audience/framing → no per-user UI shipped (deliberately) — covered by overall design.
  - §3.1 Routes → Tasks 9 (`/`), 10 (`/sessions`), 12 (`/session/:id`), 13 (`/search`), 16 (`/stats`).
  - §3.2 Global chrome → Tasks 3 (TimePicker), 4 (Nav).
  - §3.3 Time-window contract → Task 1 (parseSince + resolveSince) + Task 6 heatmap clamp.
  - §4.1 Cost home → Tasks 6 (queries), 7 (briefing), 8 (components), 9 (assembly).
  - §4.2 `/sessions` → Task 10.
  - §4.3 `/session/:id` outcomes → Tasks 11, 12.
  - §4.4 `/search` → Task 13.
  - §4.5 Behavior → Tasks 14, 15, 16.
  - §5 Data layer → Task 5 (restructure), 6 / 14 (new modules).
  - §5.3 Briefing rules → Task 7.
  - §6 Visual identity → Task 2 (model tokens) + components consume them.
  - §8 Testing → Tasks 1, 6, 7, 12, 14 each include test files.
  - §9 Risks → Task 6 heatmap clamps + uses `America/New_York`; Task 14 latency excludes sidechain; cache hit % handles zero-denominator.
- **Placeholder scan:** none — every step has actual code or commands.
- **Type consistency:** `Window` (`{start,end}`) and `Since` (`{start,end,label}`) both have the start/end pair. Pages call `resolveSince(...)` which returns `Since`; query helpers consume `{start,end}` so the structurally compatible `Since` value is accepted by TS. Field names (`projectPath`, `sessionId`, `cacheHitPct`) used consistently.
