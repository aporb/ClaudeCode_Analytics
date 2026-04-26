# CCA Dashboard Redesign — Design Spec

- **Date:** 2026-04-26
- **Status:** Draft, pending user approval
- **Author:** Amyn Porbanderwala + Claude (brainstorming session)
- **Working directory:** `/Users/amynporb/Documents/_Projects/ClaudeCode_Analytics`
- **Supersedes:** UI sections of `docs/superpowers/specs/2026-04-19-claude-code-analytics-design.md` (Plan 3 / Web UI)

---

## 1. Goal

Replace the current `apps/web` dashboard with a **cost-anchored command center** that lets a single user (designed-as-if-org) track Claude Code usage end to end across four jobs:

1. **Cost monitoring & forecasting** — how much, where, trajectory.
2. **Model & cache effectiveness** — which models are dominating spend, are cache reads paying off.
3. **Replay & audit** — given a session, what happened (outcomes first, then turn-by-turn).
4. **Productivity & behavior trends** — tool error rates, prompt→response latency, when work happens.

The current UI (sessions list at `/`, four basic charts at `/stats`) treats analytics as an afterthought. This redesign reverses that: cost is the front door, sessions list moves to its own route, and `/stats` is rebranded **Behavior** for productivity-only metrics.

This redesign is **UI-only** — no schema changes, no new ingest paths, no new daemons. All new metrics are computed on demand from existing tables, indexes, and the existing `usage_daily` materialized view.

---

## 2. Audience & framing

- **Single user today.** This machine, this user, this database. No auth, no sharing.
- **Designed-as-if-org.** The data model already supports per-actor breakdowns (`sessions.project_path`, `events.cwd`, `events.git_branch`, `events.cc_version`). The UI does not expose multi-user concepts in v1, but layout and naming should not preclude an "actor" filter being added later. Concretely: we do not bake `me` into copy or assume a single project.

---

## 3. Information architecture

### 3.1 Routes

| Route | Purpose | Driven from |
|---|---|---|
| `/` | **Cost command center** (home) | `sessions`, `messages`, `usage_daily`, `model_pricing` |
| `/sessions` | Sessions list with filters and pagination | `sessions` |
| `/session/:id` | Outcomes summary + collapsible replay | `sessions`, `events`, `messages`, `tool_calls` |
| `/search` | FTS with snippets (kept) | `messages.text_tsv` |
| `/stats` | **Behavior** — tool errors, latency, time/depth metrics | `tool_calls`, `messages`, `events`, `prompts_history` |

The previous home (sessions list at `/`) moves to `/sessions`. No redirect — old bookmarks just land on the new home.

### 3.2 Global chrome (every page)

Top nav, in this order:

```
Cost  ·  Sessions  ·  Search  ·  Behavior        [time picker ▾]   ●  live · 4s ago
```

- **Time picker**: dropdown with `Today · Last 7d · Last 30d · Last 90d · All time · Custom…`. Default `7d`. Writes `?since=` to the current route's URL using the canonical token (`today`, `7d`, `30d`, `90d`, `all`) or, for Custom, an ISO-pair (`?since=2026-04-01..2026-04-15`). Custom opens a popover with two date inputs (start, end inclusive). Cookie persists the last selection; URL always wins when set explicitly.
- **Live indicator**: kept verbatim from current implementation — green dot + "last event Xs ago" via SSE on `localhost:9939/events`.

### 3.3 Time-window contract

All server components consume the global window via a shared `parseSince()` helper. The existing helper lives in `apps/web/lib/since.ts`; it gains the new tokens (`today`, `all`, ISO-pair). Where a widget needs a minimum window for the pattern to be meaningful (the time-of-day heatmap wants ≥30 days), the widget **clamps upward** to `max(global, widgetMin)` and surfaces the actual window in the chart subtitle (e.g., "Window: 30d (clamped from 7d)").

---

## 4. Page composition

### 4.1 `/` — Cost command center

Top to bottom:

1. **KPI strip** (5 cells, equal width on desktop, 2-up on tablet, stacked on mobile):
   - **Today** — total cost USD; delta vs yesterday.
   - **Last 7d** — total cost USD; delta vs prior 7d.
   - **Cache hit %** — `sum(cache_read) / nullif(sum(cache_read + input), 0)` over global window; delta vs prior period.
   - **Top model** — model name + % of cost over window; delta in pp.
   - **Active sessions** — count where `sessions.status = 'active'`; lists 1-3 names.
   - Delta colors: red = up for cost, green = down. Sign always shown.

2. **Stacked area: spend per day, by model** (2/3) + **Briefing card** (1/3).
   - Stacked area X-axis = day, Y-axis = $, color = model. Legend shows model + % of window total. Clicking the legend toggles a series (client-only).
   - **Briefing card** is plain-text auto-narrative (no LLM call), three lines:
     - Total spend `$X.XX` this `<window>`, `+/−Y%` vs prior period.
     - Largest contributor: `<project> on <model>` (`$X.XX`).
     - Cache hit rate: `Z%` (`+/−ΔΔpp` from prior).
   - Rules engine lives in `apps/web/lib/briefing.ts`.

3. **Top-cost sessions table** (2/3) + **Cost distribution card** (1/3).
   - Table: top 5 sessions by `estimated_cost_usd` desc within the window. Columns: project · started · models used · message count · cost. Rows link to `/session/:id`.
   - Distribution card: `percentile_cont(0.5/0.95/0.99)`, max, session count over window.

4. **Cache hit rate, daily** (1/2) + **Active hours heatmap** (1/2).
   - Cache: line chart (daily). Subtitle reports period-over-period change.
   - Heatmap: 24 cols × 7 rows (hour × day-of-week). Cell color encodes session count by default, with a small chip toggle to switch the encoded measure to total cost (`?heat=cost`). **Window for this widget clamps to ≥30d.**

### 4.2 `/sessions` — sessions list

- Mostly today's behavior, repotted under the new chrome.
- Filters bar: `project` (substring), `model` (chip multi-select). `since` is read from the global picker (no per-page since input).
- Default sort: `started_at desc`. Toggle: `cost desc`.
- Columns: when · duration · message count · tool count · models used (chips) · tool errors (red chip if > 0) · cost · session id · project / first prompt preview.
- Pagination via `?page=`, 50 per page (kept).

### 4.3 `/session/:id` — outcomes + replay

Above the fold:

- **Header**: `<project> · <started> → <ended> (<duration>)`. Below: model chips, branch, `cc_version`, `?raw=1` toggle.
- **6-cell stat strip**: Cost · Messages · Tool calls · Tool errors · Cache hit % · Subagent count.
- **3-panel row**:
  - **Top tools** (top 5 by call count, with per-tool error chip when `is_error`).
  - **Files touched** (top 5 most-modified file paths, derived from `tool_calls.input->>'file_path'` where `tool_name IN (Read, Write, Edit, MultiEdit, NotebookEdit)`, with a "+ N more" tail).
  - **Cost split** by model (% + $) and total tokens (in/out/cache-read).
- **First prompts** strip: 3 earliest user messages from the main thread (filter `messages WHERE role='user' AND is_sidechain=false ORDER BY timestamp ASC LIMIT 3`, so subagent prompts don't pollute), truncated to ~140 chars each.

Below the fold:

- **Replay timeline** — the existing component, **collapsed by default**. Toggle expands and writes `?replay=1` to the URL. Inside, behavior unchanged: events ordered, tool calls collapsible, sidechain styling, redaction layer.
- `?raw=1` continues to flip redaction on/off.

### 4.4 `/search` — kept, light polish

- FTS engine and `ts_headline` highlighting unchanged.
- Filter chips harmonize with the rest of the app: `project`, `model` (new), `role` (user/assistant — new). Date scope is the global picker.
- Each result row gets a small **cost** dot pulled from `sessions.estimated_cost_usd` so expensive matches are scannable.
- Pagination via `?page=` (currently capped at 50; add real pagination).

### 4.5 `/stats` — Behavior

Renamed in the nav to **Behavior**. Cost analytics moved to `/`. This page is now productivity-only.

- **Tool error rate, daily** (line) — `count(*) FILTER (WHERE is_error) / count(*)` from `tool_calls` grouped by day.
- **Prompt → response latency** (P50/P95 daily line, two series) — derived from `messages` ordered by `(session_id, timestamp)`, taking deltas between consecutive `user` and `assistant` rows in the same session, then percentiled per day.
- **Top tools** (kept from current page; total calls + per-tool error chip showing rate `errors / calls`, only displayed when rate > 0).
- **Subagent depth histogram** — buckets of `sessions.subagent_count` (0, 1, 2, 3, 4, 5, 6+).
- **Token velocity scatter** — per session `(total_input + total_output) / duration_sec`, plotted by `started_at`. Outliers tooltip.
- **Cache hit % by model** — small table joining `messages` by `model`.
- The 13-week activity grid that lived here in v0 is **removed** (the home heatmap supersedes it).

---

## 5. Data & queries

### 5.1 Layout

`apps/web/lib/queries/` becomes a folder of route-scoped query modules:

```
apps/web/lib/queries/
  cost.ts        // KPIs, stacked-area spend, briefing inputs, top-cost, distribution, cache, heatmap
  sessions.ts    // listSessions (existing, refactored to use global since)
  session.ts    // getSessionMeta, getSessionStats, getSessionTopTools, getSessionFilesTouched, getSessionFirstPrompts, getSessionEvents (existing), getSessionToolCalls (existing)
  search.ts     // ftsSearch (existing, refactored)
  behavior.ts   // toolErrorRate, latencyPercentiles, subagentHistogram, tokenVelocity, cacheByModel
  briefing.ts   // pure rule-based narrative generator (no LLM)
```

All queries take the resolved `since: { start: Date, end: Date }` from the global picker. None read URL params directly.

### 5.2 No new mat-views in v1

With ~600 sessions / ~325K events today, queries are expected to land sub-100ms on existing indexes:

- `(session_id, timestamp)` on `events`, `messages`, `tool_calls`.
- `(project_path, timestamp DESC)` on `events`.
- `(tool_name, timestamp DESC)` on `tool_calls`.
- GIN on `messages.text_tsv`, `messages.text_content` trigram.
- `usage_daily` materialized view: `(day, project_path, model) → token totals`.

If profiling after build shows a query > 250ms, we add a `session_aggregates` mat-view as a follow-up. **Not blocking v1.**

### 5.3 Briefing rules

Pure function `briefing(window) → { totalSpend, deltaPct, topContributor: {project, model, cost}, cacheHit, cacheHitDeltaPp }`. Renderer interpolates into a fixed three-line template. No LLM.

Edge cases:
- If prior period had `total_spend = 0`, omit the delta line.
- If the window is `Today` and today is < 6 hours old, label "today so far".
- If `usage_daily` rows are missing for the prior period, the delta becomes "—" (no fabricated comparison).

---

## 6. Visual identity

- Stay with the current shadcn neutral palette and Tailwind dark-mode variants.
- Add three model-color tokens in `apps/web/app/globals.css` (HSL triplets so opacity utilities work):
  ```css
  --model-opus:   265 90% 76%;   /* purple */
  --model-sonnet: 142 70% 45%;   /* green */
  --model-haiku:  217 91% 60%;   /* blue */
  ```
- All chips, legends, stacked-area fills consume those tokens. One color, one model, everywhere.
- Density: hybrid/briefing — KPI strip up top, hero chart + briefing, then panels. Tailwind grids; no card-shadow chrome (keep the flatter shadcn aesthetic).

---

## 7. Out of scope (v1)

- Auth, sharing, multi-user.
- Settings page (default time window, theme override).
- Annotations / notes / tags on sessions.
- Data export (CSV/JSON).
- Live "right now" page (kept as the small header indicator).
- Schema changes; new mat-views; new ingest path.
- AI-summarized briefings (briefing is rule-based).
- Mobile-first layout (responsive but desktop-first).

These are explicitly deferred and may be revisited after v1 is in use.

---

## 8. Testing

- **Query helpers** (`apps/web/lib/queries/*`): unit-style tests against a real seeded test database, matching the pattern in `apps/ingester/src/writer/*.test.ts`. Each query gets a small fixture and an assertion on shape and values. `fileParallelism: false` already in place.
- **Pages**: one smoke test per route with React Testing Library + Vitest, rendering the server component with mocked query results (the queries are unit-tested separately). Asserts presence of key elements (KPIs, chart titles, table rows). No pixel snapshots.
- **Time picker**: unit test on the URL ↔ cookie ↔ default precedence.
- **Briefing**: unit tests on the rule engine (covers zero-prior-period, missing data, sub-day "today" labeling).

CI runs `pnpm test` + `pnpm typecheck` as today.

---

## 9. Risks & open notes

- **Time-of-day heatmap interpretation**: hour bucket uses `America/New_York`. If the user travels, history will read off by N hours. Acceptable for v1; surface the timezone in the chart subtitle.
- **Latency percentiles** depend on consecutive `(user, assistant)` ordering inside `messages`. Sidechain (subagent) messages must be excluded so the delta isn't poisoned. Filter `is_sidechain = false`.
- **Briefing's "largest contributor"** depends on `usage_daily` being current. If the daemon is down, the home page will show stale data. Acceptable — the live indicator already exposes daemon health.
- **Browser hardening**: the briefing card and KPIs are server-rendered text; no raw-HTML-insertion APIs are introduced. Search keeps its existing `ts_headline` snippet pattern (already justified safe; only renders Postgres-emitted `<b>` tags).
- **Migration**: the change from "`/` = sessions" to "`/` = cost" is a hard cutover. Single-user, low blast radius. Documented in README on rollout.

---

## 10. Acceptance

The redesign is done when:

- All five routes load against the live database with realistic data.
- Global time picker works end-to-end (URL + cookie + default).
- Briefing card produces a sensible, non-fabricated narrative for at least three windows: a busy day, a quiet day, and "All time".
- `/session/:id` outcomes summary renders correctly for sessions with multiple models, with errors, and with subagents.
- All hero metrics (cache hit, model mix, cost distribution, time-of-day) are visible without scrolling on a 1440×900 display.
- Tests are green; type-check is clean.
- README operational sections still apply (no port or process changes).

---

## 11. Pointers

- Original system spec: `docs/superpowers/specs/2026-04-19-claude-code-analytics-design.md`
- Plan completion notes: `STATUS.md`
- Existing web app: `apps/web/`
- Existing query helpers (to be refactored): `apps/web/lib/queries.ts`
- Existing schemas: `packages/db/src/schema/`
