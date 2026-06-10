# Decision Intelligence — Insights, Risks, Forecasts, Outcomes

> Per-project **Insights** tab · portfolio **/insights** view · `GET /api/projects/:id/insights` · `GET /api/insights`
> An enhanced visual version of this document: [`decision-intelligence.html`](decision-intelligence.html)

Threlmark records everything that happens to work — lane transitions, due dates, handoffs, agent reports, decision notes, outcomes. The **Insights** layer turns that record into the four questions an operator actually asks:

1. **What's at risk right now?** → the *risk register*
2. **When will this realistically be done?** → the *completion forecast*
3. **What did we decide, and why?** → the *decision log*
4. **What did shipping actually produce?** → the *outcome ledger*

Everything is **derived at read time** (`src/lib/insights.ts`). There is no new on-disk state, no background job, and nothing to get out of sync: delete the Insights code and your data is untouched; re-add it and every signal reappears.

---

## 1. The risk register

`assessRisks(items, opts)` scans a project (or every project, on the portfolio view) and emits typed, severity-ranked signals. Each signal carries a human explanation **and a suggested action** — the register tells you what to do, not just what's wrong.

| Kind | Trigger | Severity |
| --- | --- | --- |
| `overdue` | `dueDate` in the past, item not Done | high |
| `due-soon` | due within 3 days | high if not yet in Development, medium if in progress |
| `stale-development` | item exceeds its lane's age threshold (7d in Development, 21d in Ranked, 60d in Ideas) | high in Development, low elsewhere |
| `wip-over-limit` | lane count exceeds the project's WIP limit | high for Development, medium elsewhere |
| `stalled-handoff` | handed to an agent > 7 days ago, still not Done | high |
| `bottleneck` | an open item that `blocks` others in the dependency graph | high when blocking ≥ 2 |
| `idea-pileup` | ≥ 15 ideas and > 60 % of the board unranked | low |
| `throughput-stall` | work in Development but nothing reached Done in 3+ weeks | medium |

Signals are sorted high → low. On the portfolio view each one links to its project board.

### Reading it

A healthy board shows an empty register. A typical unhealthy one reads like a triage list:

```
HIGH   Overdue: Q3 pricing page            Due 2026-06-01 — 9 days past due in Ranked.
       → Finish it, re-date it, or consciously drop it.
HIGH   Development over WIP limit (8/3)    8 items against a limit of 3.
       → Stop starting, start finishing.
MEDIUM Nothing shipped in 3+ weeks         2 items in Development, last Done on 2026-05-12.
       → Pick the closest-to-done item and finish it.
```

## 2. The completion forecast

`forecastCompletion(items)` answers *"when will the Ranked + Development backlog drain?"* with a **Monte Carlo simulation over your real history**:

- It buckets the last **12 full weeks** of items reaching Done (the current partial week is excluded — it would bias the rate low).
- Each simulation run repeatedly samples one of those real weekly rates until the backlog reaches zero; 1 000 runs produce a distribution.
- You get the **P50** ("likely") and **P85** ("conservative") finish dates plus the observed average per week.

Two honesty rules:

- **No invented dates.** With fewer than 2 non-zero throughput weeks the forecast returns `null` and says why ("finish a few items first").
- **Deterministic.** The simulation uses a seeded PRNG (mulberry32), so the same board state always yields the same forecast — testable, reproducible, no flicker between reloads.

## 3. The decision log

Any note on a card can be typed *comment* or **decision** (item editor → "Comments & decisions"). The Insights tab aggregates every decision across the project, newest first, with the item it was made on. This is the lightweight audit trail: *what we chose, when, on which piece of work* — without a separate documents system.

## 4. The outcome ledger

When an item reaches Done its **`outcome`** field records what was actually built — auto-filled when a Claude/Codex `done` report arrives, or written by hand. The ledger lists those outcomes newest first (with project and agent attribution on the portfolio view). Over time it becomes the honest changelog of the whole portfolio: not what was planned, but what shipped and what it produced.

## 5. The portfolio view (`/insights`)

The sidebar's **◈ Insights** aggregates all of the above across every active project, and adds the **cross-project initiative rollup**: every label used on 2+ items, rolled up portfolio-wide with progress and the list of projects it spans. A theme like `vNext` or `decision-intelligence` is trackable wherever the work actually lives.

---

## API

```bash
curl -s localhost:4789/api/projects/threlmark/insights | jq '.risks[0]'
{
  "kind": "wip-over-limit",
  "severity": "high",
  "title": "Development over WIP limit (8/3)",
  "detail": "8 items against a limit of 3.",
  "action": "Stop starting, start finishing: close or demote items before pulling new work.",
  "projectId": "threlmark",
  "projectName": "Threlmark",
  "itemIds": ["…"]
}
```

`GET /api/projects/:id/insights` → `{ projectId, risks, forecast, decisions, outcomes, generatedAt }`
`GET /api/insights` → `{ projectCount, risks, forecast, initiatives, outcomes, generatedAt }`

Both are plain JSON like every other Threlmark route — an agent (or your own script) can read the same intelligence the UI shows and act on it. Anything a user can see here, an agent can see too.

## Design notes

- **Pure core, thin I/O.** `assessRisks` / `forecastCompletion` are pure functions over item arrays with injectable `now`/`rng` — see `src/lib/__tests__/insights.test.ts` for the full behavioral contract (every risk kind is covered).
- **Reuses flow primitives.** Staleness, overdue, stalled-handoff and week bucketing are the same `src/lib/flow.ts` functions the Flow tab uses, so Insights and Flow can never disagree.
- **No schema change.** Initiative rollups remain a pure label aggregation (per `AGENTS.md`); risks/forecast/outcomes read fields that already existed.
