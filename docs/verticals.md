# Threlmark for Every Vertical — Templates & Custom Categories

> New-project template picker · per-project `categories` · free-form item categories
> Visual companion: [`decision-intelligence.html`](decision-intelligence.html) (covers both features)

The marketing promise is "for founders, product owners, and operators — no technical background needed". The board, scoring, flow and agent loop were always vertical-neutral; the one thing that wasn't was the **category taxonomy**, which was hardcoded to software work (`Research, Discovery, …, Build, UX, Automation`). That's fixed at three levels:

## 1. Vertical templates (new project)

The new-project page offers five templates. A template is **pure seed data** — categories, suggested WIP limits and lane policies, applied once at creation. The project owns the result and can edit everything in ⚙ settings.

| Template | Categories | Flavor |
| --- | --- | --- |
| **Software product** | Research, Discovery, Reports, Trends, Validation, Build, Distribution, Operations, UX, Automation | the classic Threlmark board |
| **Marketing & content** | Content, Campaigns, SEO, Social, Email, Video, Brand, Partnerships, Analytics | "Done = published; record reach in the outcome" |
| **Business operations** | Strategy, Finance, Hiring, Process, Legal, Vendors, Sales, Support, Tooling | one owner per item in motion |
| **Research & trading** | Hypothesis, Data, Backtest, Risk, Execution, Calibration, Infra, Reporting | "validated **or killed** — both count as Done" |
| **Compliance & regulated** | Policy, Audit, Validation, Documentation, Training, CAPA, Risk, Submission | decision notes as rationale, outcome as audit evidence |

API: `POST /api/projects` accepts `{ "template": "research-trading" }`; explicit `categories` / `wipLimits` / `lanePolicies` in the same body override the template. Unknown template ids are rejected with 400.

## 2. Per-project categories

`project.json` gains one optional, additive field:

```json
{ "categories": ["Hypothesis", "Data", "Backtest", "Risk", "Execution"] }
```

- Absent ⇒ the default list. **Zero migration**; every existing project behaves exactly as before.
- The board's add-form, edit modal and category filter all derive from `project.categories` — **unioned with categories actually present on items**, so foreign data is always filterable and editable.
- Editable any time: board ⚙ → "Categories". Trimmed, deduped, capped at 24 × 40 chars.

## 3. Free-form item categories (the interop fix)

`RoadmapItem.category` is now typed and validated as a **free-form string** (trimmed, ≤ 40 chars, falls back to `"Build"` only for empty/non-string values).

This fixes a real contract violation: previously, an external tool writing `"category": "Campaigns"` into an item file would have its value **silently coerced to `"Build"`** on the next read-merge-write — contradicting the "open data on disk" promise. Now any vertical's taxonomy round-trips intact, including through suggestions (`suggestions/<id>.json` with `"category": "CAPA"` keeps it on accept).

Covered by tests: `src/lib/__tests__/domain.test.ts` (`toCategory`, `normalizeItem`, `normalizeCategories`, templates).

## Saved views

Since every vertical slices its board differently, the toolbar's **☆ Save view** captures the current search + category + label filters as a named chip (`project.savedViews`). One click applies a view, clicking it again clears the filters, ✕ deletes it. Views are part of `project.json`, so they travel with the data like everything else.

## Putting it together — a non-software example

A compliance team creates a project from the **Compliance & regulated** template:

1. Audit findings land as items in **Ideas** with category `Audit`; external tooling can drop them into the Inbox as suggestions with the same category.
2. Scoring works unchanged — *evidence* reads naturally as "how solid is the finding", *effort* as remediation cost.
3. Remediation work moves through **Development** under a WIP limit of 3; the rationale for each disposition is a **decision** note.
4. On Done, the **outcome** field holds the closure evidence — and the **Insights** tab gives the team a live risk register (overdue obligations first) and an honest forecast for the remediation backlog.

Same engine, different vocabulary — which is the point.
