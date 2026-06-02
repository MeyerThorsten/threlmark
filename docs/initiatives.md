# Initiatives

**Initiatives turn an item's `labels` into first-class, trackable sub-roadmaps inside a single project.** An *Initiatives strip* at the top of the board shows each label as a chip with live progress (`done/total`, `%`, and a progress bar). Click a chip to focus the board on just that initiative — it drives the same label filter that already existed, so there is nothing new to learn and nothing new to store.

> No schema or API change. `labels: string[]` on an item remains the storage; Initiatives are a pure, read-time **rollup** over the items already on the board.

---

## What it is

An **initiative** is any distinct label that appears on one or more items in a project. Threlmark groups every item carrying that label, computes a small progress rollup, and renders it as a clickable chip:

- **`done / total`** — how many of the initiative's items have reached the `done` lane, out of all items with that label.
- **`%`** — `round(done / total · 100)`, also drawn as a progress bar.
- **Click-to-focus** — clicking a chip sets the board's **label filter** to that label (and clicking the active chip clears it back to *All labels*). The chip shows its active state (`aria-pressed`) while focused.

An item with several labels contributes to **each** of its initiatives at once — e.g. a card labeled `vNext, billing` counts toward both the *vNext* and the *billing* initiative. Items with no labels are simply ignored. The strip only appears when at least one labeled item exists.

The strip lists initiatives sorted by **size first** (most items), then alphabetically, so the biggest pushes surface at the top.

## Why

Roadmaps often grow a cluster of work that belongs together but isn't a product of its own — a "vNext" push, a billing rework, a migration, a launch. The tempting-but-wrong move is to spin up a **separate project** for it. That fractures the data: the work no longer ranks against the rest of the real project, its flow metrics (WIP, cycle time, throughput) split off, and the Portfolio double-counts.

Initiatives give you that grouping **without leaving the project**:

- A **"vNext" initiative lives inside the real project** instead of as a parallel project. Its items still rank against everything else, still flow through the same lanes, and still roll up into the same project/Portfolio flow numbers.
- You get an at-a-glance **burn-down** per theme (`done/total`, `%`) without any new concept, table, or storage.
- Because it reuses the existing label filter, "focus on this initiative" is the same action as "filter the board by this label" — one mental model, one code path.

## How it works

1. **Labels are the flag.** Each item already has an optional `labels: string[]` (free-form tags). A label *is* an initiative membership flag — no separate "initiative" entity exists.
2. **The rollup is derived on read.** `src/lib/initiatives.ts` exposes a pure `summarizeInitiatives(items)` that walks the board's items, buckets them by label, and produces one `InitiativeSummary` per label:

   ```ts
   interface InitiativeSummary {
     label: string;
     total: number;                 // items carrying this label
     done: number;                  // of those, in the `done` lane
     open: number;                  // total − done
     pctDone: number;               // round(done / total · 100)
     prioritySum: number;           // sum of computed priority (for future weighting)
     byLane: Record<Lane, number>;  // count per idea/ranked/development/done
   }
   ```

   It performs **no I/O** and makes **no schema or store changes** — it is a deterministic aggregation over the items the board already loaded. Priority is the same computed value used everywhere (never stored), so an initiative's numbers can't drift from the cards.
3. **The strip renders the rollup.** `roadmap-workspace.tsx` memoizes `summarizeInitiatives(all)` and renders one chip per initiative (label, `done/total`, `%`, bar). The strip is hidden when there are no labeled items.
4. **Click-to-focus reuses the label filter.** Each chip is a button that toggles the existing `labelFilter` state — the very same filter exposed in the toolbar's *Label filter* dropdown. Focusing an initiative narrows every lane to that label; the rest of the board behavior (search, category filter, drag, scoring, handoff) is unchanged. Clicking the focused chip again returns to *All labels*.

Because focus is just the label filter, an initiative composes with everything else: filter to *vNext*, then **Rank by score**, **Push top 3**, select cards, and **Copy dev brief** / hand off — labels are already carried into handoff briefs, so the agent sees which initiative a card belongs to.

## How to use it

1. **Tag items with a label.** Open an item in the **item editor** (or the inline *Add Item* form) and put a name in **Labels (comma-separated)** — e.g. `vNext`. Add the same label to every item that belongs to the push. (Labels are de-duplicated and trimmed automatically.)
2. **Watch the initiative appear.** As soon as one item carries the label, a **vNext** chip shows up in the Initiatives strip with its current `done/total` and `%`.
3. **Focus it.** Click the **vNext** chip to filter the board to just those items; click it again (or pick *All labels*) to unfocus. Work the lane as usual — moving a card to **Done** ticks the initiative's `done` count and bar up on the next render.
4. **Track progress.** The `done/total` and `%` are a live burn-down for that theme. Hover a chip for the same summary in its tooltip.

That's the whole workflow: **add a label → it's an initiative with progress → click to focus.** No project to create, no migration, no extra screen.

## Data model note

- **`labels: string[]` is unchanged and remains the only storage.** Initiatives add **no** field, file, route, or schema version bump. The item schema, `items/<itemId>.json`, and the REST API are all exactly as documented in the [README](../README.md#the-shared-data-contract).
- **Forward-compatible.** Existing items (including ones with no `labels`) keep working untouched; the rollup just skips them. Unknown keys are still preserved on read/write, so this stays compatible with the shared on-disk contract.
- **External tools can set labels.** Because labels are plain data on items and suggestions, any tool that speaks Threlmark's contract can create or grow an initiative:
  - A **suggestion** (`suggestions/<id>.json`) may include `labels: ["vNext"]`; those labels are copied onto the item when you **Accept** it, so the accepted card lands in the right initiative immediately.
  - **IdeaClyst** (and any other contributor) can therefore propose work *into a named initiative* — e.g. tag its Roadmap-Intelligence suggestions with `vNext` — without knowing anything about Initiatives as a feature. It only writes `labels`; Threlmark does the rollup.
- **Deterministic.** `summarizeInitiatives` is pure and side-effect-free, so the same board always yields the same initiatives — easy to test and safe to call on every render.

## Limitations & future

- **Flat, label-equality grouping.** Membership is exact-label match. There's no hierarchy, no synonyms/aliasing, and no fuzzy grouping — `vNext` and `v-next` are two different initiatives. Keep label names consistent (the editor de-dupes and trims, but doesn't normalize casing or spelling).
- **An item can belong to many initiatives.** This is intentional (a card can be both `vNext` and `billing`), but it means the initiatives' totals overlap and don't sum to the project's item count.
- **Progress = `done`-lane share only.** `%` is `done/total`; it doesn't weight by priority or effort, and it doesn't show partial progress for in-flight cards (those count toward `total`/`open`, not `done`). `prioritySum` and `byLane` are already computed in the rollup and reserved for richer weighting later.
- **No board layout change yet.** Today an initiative *filters* the existing lanes. A planned **group-by-initiative swimlane view** would render each initiative as its own horizontal swimlane across the lanes (so you can see several initiatives' progress side by side without toggling the filter). The rollup's `byLane` map is already shaped to drive that view when it lands.
- **Other possible follow-ups:** per-initiative WIP/age summaries, a dedicated initiative detail (timeline + handoff status for just that label), and surfacing initiative progress on the Portfolio/Flow strips.
