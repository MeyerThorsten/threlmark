# Decision Intelligence & Verticals — Design

*2026-06-10 · initiative label: `decision-intelligence`*

## Goal

Push Threlmark from "ranked kanban for developers" to a **decision-intelligence command deck usable by any vertical** — the direction the marketing pages already promise ("for founders, product owners, and operators — no technical background needed", "command deck", "honest priorities, real flow"). The bar: the kind of derived, drill-down operational intelligence Palantir-style tools deliver — but scoped to Threlmark's local-first, plain-JSON, no-cloud contract.

Three pillars, all read-time rollups or additive optional fields (no breaking schema change):

## 1. Verticals: project templates + per-project categories

**Problem:** `CATEGORIES` is a hardcoded, software-flavored list (`Research, Discovery, … Build, UX, Automation`). A trading desk, a content studio, or a compliance team can't describe their work with it — yet the marketing targets exactly those operators.

**Design:**
- `Project.categories?: string[]` — optional, additive. Absent ⇒ default `CATEGORIES` (zero migration).
- `RoadmapItem.category` relaxes from the closed union to `string`. `toCategory()` accepts any non-empty trimmed string (≤ 40 chars), falling back to `"Build"`. This also fixes a real interop bug: today an external tool writing `category: "Campaigns"` gets silently coerced to `"Build"` on the next read-merge-write — violating the "open data on disk" promise.
- `src/lib/templates.ts` — `PROJECT_TEMPLATES`: Software Product (current defaults), Marketing & Content, Business Operations, Research & Trading, Compliance & Regulated. Each = categories + suggested WIP limits + lane policies. Pure data, unit-testable.
- New-project page gets a template picker; `POST /api/projects` accepts `template` and/or explicit `categories`/`wipLimits`/`lanePolicies`. Project settings can edit categories. Item editor / add form / filters derive category options from `project.categories ?? CATEGORIES`, unioned with categories actually present on items (so foreign data is always editable, never lost).

## 2. Insights: risk register, forecast, decision log, outcome ledger

**Problem:** Threlmark records everything (transitions, handoffs, reports, decisions, outcomes) but only *displays* state. The decision-grade questions — "what's at risk?", "when will this be done?", "what did we decide and what did it produce?" — have no view.

**Design — `src/lib/insights.ts`, pure functions over existing data:**
- **Risk register** `assessRisks(items, opts)` → `RiskSignal[]` with `kind` (`overdue`, `due-soon`, `stale-development`, `wip-over-limit`, `stalled-handoff`, `bottleneck`, `idea-pileup`, `throughput-stall`), `severity` (high/medium/low), human `title`/`detail`, suggested `action`, and the affected `itemIds`. Derived from the same primitives flow already uses (`isStale`, `isOverdue`, `isStalledBrief`, links graph, throughput).
- **Forecast** `forecastCompletion(items, opts)` — Monte Carlo over the last 12 weeks of real weekly throughput: sample weeks-to-drain for the remaining ranked+development backlog, report P50/P85 finish weeks + observed weekly rate. Seeded RNG (mulberry32) so results are deterministic and testable. Honest degradation: with < 2 non-zero throughput weeks it returns `null` + reason instead of a fake date.
- **Decision log / outcome ledger** — read-time aggregation of existing `kind: "decision"` comments and `outcome` fields on Done items.

**Surfaces:**
- `GET /api/projects/[id]/insights` → `{ forecast, risks, decisions, outcomes }`; new project tab **Insights** (`/projects/[id]/insights`).
- `GET /api/insights` → portfolio-level: risks across all projects, portfolio forecast, cross-project initiative rollup (extends `summarizeInitiatives` across projects — still a pure read-time label rollup per AGENTS.md), recent outcomes. New page `/insights` linked from the sidebar.

## 3. Saved views (existing roadmap idea, shipped as part of this push)

`Project.savedViews?: { id, name, search?, category?, label? }[]` persisted via the existing project PATCH. The board toolbar gets "Save view" + chips to apply/remove. Every vertical slices its board differently; saved views make the one board serve them all.

## Testing

Introduce **vitest** (`npm test`). Unit coverage for: `priority`, `computeFlow`, `summarizeInitiatives` (+ portfolio variant), `normalizeItem`/`toCategory` relaxation, `templates`, `insights` (risk kinds, severities, deterministic forecast), project normalization (`categories`, `savedViews`). UI verified against the running dev server on :4789; `tsc --noEmit`, `eslint`, `next build` must pass.

## Documentation

- `docs/decision-intelligence.md` + enhanced `docs/decision-intelligence.html` (charts/visuals).
- `docs/verticals.md` (templates, custom categories, interop contract).
- Marketing: two new feature tiles on `site/index.html` (Insights / Verticals) — deployed only via the existing explicit `npm run deploy:marketing`.
- AGENTS.md note for future agents.

## Dogfooding / tracking

All work is tracked in the live Threlmark app (project `threlmark`, http://localhost:4789/projects/threlmark) under the initiative label `decision-intelligence`: existing idea items ("Add a roadmap progress & trend report", "Add board templates…", "Saved filter views") are relabeled and moved to Development; new items are created for categories, risk register, forecast, portfolio insights and the test suite. On completion each item receives a `done` agent report via `POST …/items/[id]/report`, which auto-moves it to Done with the outcome recorded.

## Non-goals

Accounts/auth, cloud sync, real-time collaboration, heavyweight graph visualization, per-item custom fields, manual.html rewrite (separate content task).
