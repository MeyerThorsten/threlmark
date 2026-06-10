<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Initiatives

An item's `labels: string[]` are the **flag/initiative mechanism**: each distinct label is surfaced as a first-class, trackable sub-roadmap — an Initiatives strip with progress (done/total, %) and click-to-focus, reusing the existing label filter. It is a pure read-time rollup (`src/lib/initiatives.ts`, `summarizeInitiatives`) with **no schema or API change** — `labels` remain the only storage. To put work in an initiative (e.g. `vNext`), set/extend an item's (or a suggestion's) `labels`; don't add new fields. See `docs/initiatives.md`.

## Insights & verticals

The **Insights** layer (`src/lib/insights.ts`) is a pure read-time derivation — risk register, seeded Monte Carlo forecast, decision log, outcome ledger — over data the store already records. Keep it that way: no new on-disk state for intelligence features; extend `assessRisks`/`forecastCompletion` instead. Surfaces: `/insights`, `/projects/[id]/insights`, `GET /api/insights`, `GET /api/projects/[id]/insights`. Docs: `docs/decision-intelligence.md`.

**Categories are free-form strings** (vertical-open): `Project.categories?: string[]` defines a project's list (else default `CATEGORIES`), and `toCategory` preserves any non-empty string — never "fix" an unknown category back to the default union, that breaks the on-disk interop contract. Vertical templates live in `src/lib/templates.ts` (pure data, applied once at `POST /api/projects` via `template`). Docs: `docs/verticals.md`.

Run `npm test` (vitest, `src/lib/__tests__/`) plus `npm run typecheck` and `npm run lint` before committing.
