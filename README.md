# Threlmark

[![License: MIT](https://img.shields.io/badge/License-MIT-4f46e5.svg)](LICENSE) &nbsp;[![Website](https://img.shields.io/badge/web-threlmark.com-0f766e.svg)](https://threlmark.com) &nbsp;Next.js · TypeScript · local-first · no database

🌐 **Website & manual:** [threlmark.com](https://threlmark.com) · 📖 [User manual](https://threlmark.com/manual.html)

**A local-first, central project & roadmap hub.** Manage *all* your projects in one place and run a ranked, kanban-style roadmap for each — with the data stored as plain JSON on disk so your other tools can read a project's roadmap and write suggestions back into it.

Threlmark generalizes a single-product roadmap (the localStorage "Roadmap Lab" kanban) into a multi-project hub: every app you build (IdeaClyst, ChannelHelm, …) becomes a *project* with its own scored kanban, plus a cross-project **Portfolio**, an **Inbox** for incoming suggestions, and **handoff briefs** that turn selected cards into Claude/Codex implementation prompts.

> Built with Next.js (App Router) + TypeScript. No database, no cloud, no accounts. Disk JSON under `~/.threlmark` is the single source of truth; a small REST API sits over the same store so the UI and external tools share one path.

📖 A richer, illustrated version of these docs (diagrams + charts) lives at **[`docs/threlmark-docs.html`](docs/threlmark-docs.html)** — open it in a browser.

---

## Quick start

```bash
npm install
npm run dev        # http://localhost:3000  (or: PORT=4789 npm run dev)
```

First run shows an empty Portfolio. Create a project from the sidebar, or go to **Import** and point it at the original `roadmap.html` to seed one.

```bash
npm run typecheck  # tsc --noEmit
npm run lint       # eslint
npm run build      # production build
```

### Where the data lives

All state is JSON on disk under the **data root**, which defaults to `~/.threlmark` and can be overridden:

```bash
THRELMARK_DATA_DIR=/path/to/data npm run dev
```

The root is *home-based, not repo-relative*, on purpose — it's a shared hub that every one of your apps points at.

---

## Core concepts

| Concept | What it is |
| --- | --- |
| **Project** | One app/product. Has its own kanban roadmap. Lives at `projects/<id>/`. |
| **Item** | A roadmap card: title, category, 4 scores, description, target files, acceptance criteria. One file each. |
| **Lane / status** | `idea → ranked → development → done`. The lane *is* the item's `status`. |
| **Priority** | Computed, never stored: `max(0, round(impact·3 + evidence·2 + fit·2 − effort·1.5))`. |
| **Suggestion** | A drop-zone JSON another tool writes into `projects/<id>/suggestions/`. Surfaces in the **Inbox**. GitHub issue/project import lands here too. |
| **Comment / decision** | An append-only note on an item (`kind: comment` or `decision`), stored under `projects/<id>/comments/<itemId>/`. |
| **Due / scheduled** | Optional `dueDate` and `scheduledFor` (`YYYY-MM-DD`) on an item. A past `dueDate` on an unfinished card is **overdue**. |
| **Portfolio** | Cross-project ranking of every item by status-weighted priority. |
| **Shared item** | One canonical card referenced by several projects (refactor duplicated work). |
| **Link** | A cross-project dependency edge (`blocks` / `relates` / `duplicates`). |
| **Flow** | The board is a *flow* view: every item records lane `transitions[]`, so age, cycle time and throughput are measurable. |
| **WIP limit** | A per-lane cap (`wipLimits`) that flags a lane when overloaded — the core flow-management lever. |
| **Handoff (agent flow)** | A recorded handoff stamps items with `handoff:{agent}`; the Flow view tracks **brief → shipped**, agent throughput, and stalled briefs. |

### Scoring

Each item is scored 1–5 on four axes and gets a computed **priority**:

```
priority = max(0, round(impact·3 + evidence·2 + fit·2 − effort·1.5))
```

Impact and the evidence/fit axes push priority up; effort pulls it down. The formula is reused verbatim from the original Roadmap Lab so imported cards rank identically (e.g. `5/5/5/4` → **29**).

### Portfolio ranking

Across all active projects, each item is ranked by a **status-weighted** score so in-flight work rises to the top, with a small boost for items that block others:

```
score = priority · statusWeight  (+ 0.1 · blockedCount · priority)
statusWeight = { development: 1.3, ranked: 1.0, idea: 0.85, done: 0.15 }
```

### Flow & WIP (modern Kanban)

The board is a *flow* visualization, not just status tracking. Each item carries an append-only `transitions[]` history (first entry = creation; every lane move appends one), which powers:

- **Work-item age** = time in the current lane (now − last transition). Past a per-lane threshold (development 7d, ranked 21d, idea 60d) the card is flagged **stale**.
- **Cycle time** = entering Development → reaching Done (falls back to lead time if it skipped Development).
- **Throughput** = items reaching Done per ISO week (8-week window), per project and portfolio.
- **WIP limits** = per-lane caps in `project.json` (`wipLimits`); a lane over its limit is flagged. Optional `lanePolicies` document what each lane means.

**Agent flow.** A handoff is a first-class flow event. Recording one (Handoff tab → *Generate & mark handed off*, or `POST …/handoff` with `record:true`) stamps each item with `handoff:{handoffId, agent, at}` and writes a record under `handoffs/`. The Flow view then measures **brief → shipped** (Done − handoff time), **agent throughput** (handed-off items shipped per week, by agent), and **stalled briefs** (handed off, not Done after 7 days). See the **Flow** tab and the home page's portfolio flow strip.

**Agent report-back (closed loop).** The generated Markdown brief includes a *Reporting protocol* telling Claude/Codex to report status automatically — no manual step. The agent posts `started` / `done` / `blocked` / `failed` with a summary + the verification commands it ran, either via `POST /api/projects/:id/items/:itemId/report` (preferred) or by dropping a JSON file into `reports/` (fallback, ingested on read). A `done` report **auto-moves the card to Done**; the board polls and shows a live toast (`🤖 claude done: …`). So the full loop is: rank → hand off → agent builds *and reports* → card lands in Done → Flow counts brief → shipped.

---

## The shared data contract

Disk is the source of truth. External tools may read/write these exact shapes (atomic temp-file-then-rename writes; tolerant reads that default missing fields and preserve unknown keys).

```
~/.threlmark/
  threlmark.json                 # { schemaVersion, createdAt, updatedAt }
  links.json                     # cross-project link/dependency graph
  projects/<projectId>/
    project.json                 # project metadata + wipLimits + lanePolicies
    board.json                   # lane ordering { lanes: { idea:[ids], ranked, development, done } }
    items/<itemId>.json          # ONE roadmap card per file (source of truth)
    comments/<itemId>/<cId>.json # append-only comment / decision notes on an item
    suggestions/<sugId>.json     # external-tool drop zone (the Inbox)
    suggestions/.dismissed/      # dismissed/accepted suggestions (audit)
    handoffs/<handoffId>.json    # recorded agent handoffs (brief → shipped)
    reports/<file>.json          # agent report-back drop-zone (ingested on read)
    reports/.applied/            # ingested reports (audit)
    ROADMAP.md                   # regenerated human-readable mirror
  shared/items/<itemId>.json     # shared items referenced by many projects
  archive/projects/<projectId>/  # archived projects (still readable)
```

**Why per-item files** (not one `roadmap.json`): external tools can write concurrently without clobbering a shared array. `board.json` self-heals on read — any item present in `items/` but missing from its status lane is appended, and orphan ids are dropped. So an external tool only needs to drop an item or a suggestion file; it never touches `board.json` or `links.json`.

**IDs.** `projectId = slugify(name)` (stable, human-readable). `itemId` / `sugId = <timestampMs>-<slug>-<rand6>` (sortable). Imported cards keep their original id so re-import is idempotent. Cross-project references use the global address `"<projectId>/<itemId>"` (or `"shared/<itemId>"`).

### `items/<itemId>.json`

| field | type | notes |
| --- | --- | --- |
| `schemaVersion` | int | `2` (legacy `1` items are migrated on read) |
| `id`, `projectId` | string | id preserved on update |
| `title` | string | |
| `category` | enum | Research, Discovery, Reports, Trends, Validation, Build, Distribution, Operations, UX, Automation |
| `status` | enum | `idea` \| `ranked` \| `development` \| `done` |
| `impact`/`evidence`/`fit`/`effort` | int 1–5 | |
| `description` | string | |
| `files` | string | comma-separated target files |
| `acceptance` | string[] | acceptance criteria |
| `labels` | string[]? | free-form tags for filtering/grouping cards |
| `dueDate` | string? | `YYYY-MM-DD`; past + not `done` ⇒ overdue |
| `scheduledFor` | string? | `YYYY-MM-DD` planned start |
| `source` | string? | producing tool when accepted from a suggestion, e.g. `"ideaclyst"` (or `"trello"` / `"github"` on import) |
| `sharedRef` | string? | `"shared/<itemId>"` if this is a pointer to a shared item |
| `transitions` | `{to,at}[]` | append-only lane history (seeded from `createdAt` for legacy items) |
| `handoff` | `{handoffId,agent,at}`? | set when handed to an agent via a brief |
| `reports` | `{at,agent,status,summary,verification?}[]`? | agent report-back log (`done` auto-moves to Done) |
| `createdAt`/`updatedAt` | ISO string | |

`priority` is **never** stored — it is computed on read so it can't drift. New fields are additive: legacy items missing `transitions`/`handoff` and external tools that ignore them keep working (unknown keys are preserved).

### `suggestions/<sugId>.json` (what an external tool writes)

Only **`source`** and **`title`** are required; everything else is defaulted on read. Optional `labels` are copied to the accepted item. Set `targetProjectId` to have *accept* promote the item into a different project.

```json
{ "source": "ideaclyst", "title": "Bulk export run dossiers", "impact": 5, "effort": 2 }
```

---

## REST API

The UI and external tools call the same store functions through these routes.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` / `POST` | `/api/projects` | list / create |
| `GET` `PATCH` `DELETE` | `/api/projects/:id` | get / update / archive |
| `GET` / `POST` | `/api/projects/:id/items` | list (with computed priority) / create |
| `GET` `PATCH` `DELETE` | `/api/projects/:id/items/:itemId` | get / update / delete (incl. `dueDate`, `scheduledFor`) |
| `POST` | `/api/projects/:id/items/:itemId/move` | `{toLane,toIndex}` (lane) or `{toProjectId}` (cross-project move) |
| `GET` / `POST` | `/api/projects/:id/items/:itemId/comments` | list / append a `{kind,body,author?}` comment or decision note |
| `GET` `PATCH` | `/api/projects/:id/board` | read / persist lane order |
| `GET` / `POST` | `/api/projects/:id/suggestions` | the Inbox / import GitHub issues (`{source:"github", repo+token}` or `{githubJson}`) |
| `POST` | `/api/projects/:id/suggestions/:sugId/accept` | `{targetProjectId?}` → item |
| `POST` | `/api/projects/:id/suggestions/:sugId/dismiss` | → `.dismissed/` |
| `POST` | `/api/projects/:id/import` | `{format:"roadmap"\|"trello"}` + `{roadmapHtml\|trelloJson\|path}` |
| `POST` | `/api/projects/:id/handoff` | `{itemIds, format}` (+ `record, agent, moveToDevelopment` to log a handoff) |
| `GET` | `/api/projects/:id/handoffs` | recorded handoffs |
| `POST` | `/api/projects/:id/items/:itemId/report` | agent report-back `{agent, status, summary, verification?}` (`done` auto-moves to Done) |
| `GET` | `/api/projects/:id/reports` | ingest dropped report files + list recent reports (board polls this) |
| `GET` | `/api/projects/:id/flow` | project flow metrics (WIP, cycle time, throughput, aging, agent flow) |
| `GET` | `/api/flow` | portfolio flow metrics |
| `GET` / `POST` `DELETE` | `/api/links` , `/api/links/:id` | dependency graph |
| `GET` / `POST` | `/api/shared` , `/api/shared/:id/attach` | shared items |
| `GET` | `/api/portfolio` | cross-project ranking + graph |

### Example: another tool seeds a suggestion (pure filesystem)

```bash
mkdir -p ~/.threlmark/projects/ideaclyst/suggestions
cat > ~/.threlmark/projects/ideaclyst/suggestions/$(date +%s)-idea.json <<'JSON'
{ "source": "ideaclyst", "title": "Add competitor price-drop alerts" }
JSON
# → appears in the Threlmark Inbox within a few seconds
```

---

## Features

- **Multi-project** — create / list / switch projects and a cross-project Portfolio. **Remove a project** from its header (next to the title): a deliberate, type-the-name confirmation guards it, and it's archived — not deleted — so the data stays on disk under `archive/` and can be restored.
- **Per-project kanban** — four lanes, drag-between-lanes, 4-axis scoring + computed priority, categories.
- **Labels & filters** — tag items/suggestions with free-form labels, filter a board by label, and carry labels into handoff briefs.
- **Due dates & scheduling** — give an item a `scheduledFor` start and a `dueDate`; the board flags **overdue** cards (and the Flow view counts them) until they reach Done.
- **Comments & decision notes** — append-only notes on any item, typed as a plain *comment* or a *decision* record, kept on disk alongside the card.
- **Activity timeline** — every item detail shows a derived history (created, lane moves, handoff, reports, comments) so the trail of work is always visible.
- **Roadmap Lab workflow** — search, category filter, *Rank by score*, *Push top 3*, inline Add Item, on-card sliders, card selection → live Queue/Markdown/JSON brief, *Copy dev brief*.
- **Import** — pull in an existing roadmap three ways: the original `roadmap.html` `defaults` array, a **Trello** board export (lists → lanes, labels, due dates, checklists → acceptance), or **GitHub** issues/projects (live via the API or pasted JSON) into the Inbox. All idempotent — re-import updates by stable source id instead of duplicating.
- **Handoff** — export selected items as file-scoped Claude/Codex prompts with acceptance checkboxes + verification commands, or as Markdown/JSON.
- **Inbox** — surface `suggestions/<id>.json`, accept (→ item with `source`) or dismiss; cross-project promote.
- **Cross-project** — move items between projects, link/depend, share one item across projects.
- **Flow** — WIP limits per lane, work-item-age / stale badges, a **Flow** tab (throughput, cycle time, aging) and a portfolio flow strip.
- **Agent flow** — record handoffs to Claude/Codex and track brief → shipped, agent throughput, and stalled briefs.
- **Agent report-back** — briefs instruct the agent to report status automatically; a `done` report auto-moves the card to Done with a live toast (closed loop, no manual step).
- **Dark mode** — a light/dark theme toggle in the sidebar; the choice is remembered locally and applied before first paint (no flash).
- **Local-first** — no cloud, no accounts, no secrets.

---

## Project layout

```
src/lib/         fsops, paths, ids, priority, flow, metrics, activity, schema/{types,version,normalize}
                 projects/ items/ board/ suggestions/ comments/ links/ shared/ stores
                 importer/{roadmap-html,trello,github}, handoff/{generate,records}, portfolio, markdown
src/app/         portfolio (/), projects/[id] (board, flow, inbox, handoff, import),
                 import, shared, projects/new, api/** route handlers (incl. flow, handoffs, comments)
src/components/  sidebar, theme-toggle, roadmap-workspace, item-editor, inbox-list, flow-panel,
                 portfolio-flow, project-settings, links-manager, import-form,
                 handoff-panel, project-nav
docs/            documentation (README.html, threlmark-docs.html, HOSTING.html/md)
site/            the public Threlmark.com website (static, incl. 4-language manual)
```

---

## Ecosystem: Threlmark + IdeaClyst

Threlmark isn't only a UI — its **on-disk layout is a contract** other local-first tools read and write. The first such tool is **[IdeaClyst](https://ideaclyst.com)**, and the two form a closed loop.

### The two halves
- **Threlmark** is the *system of record* for roadmaps: it holds every project's items, ranks them, manages flow (WIP, cycle time, throughput), and runs the handoff → agent → done loop. It owns the data under `~/.threlmark`.
- **IdeaClyst** is an *idea engine*: it turns rough product ideas into founder packets via a Claude↔Codex "council" and scouts the web for opportunities. It does **not** own roadmaps — it *contributes* to them.

### How IdeaClyst adapted to integrate
IdeaClyst added a dedicated **`src/lib/threlmark/`** layer that speaks Threlmark's exact contract (it verified the shapes against a real `~/.threlmark/projects/ideaclyst/`):
- **Reads roadmaps read-only** — `reader.ts` lists projects and reads a project's items + `board.json`, computing the same `priority` (`gaps.ts` adds a deterministic *gap map*: category coverage, lane counts, under-covered areas). Threlmark's per-item-file format (not a single `roadmap.json`) is matched exactly.
- **Writes only suggestions** — `writer.ts` drops `projects/<id>/suggestions/<id>.json` via the same atomic temp-then-rename pattern. The suggestion is the flat shape Threlmark expects (`source:"ideaclyst"`, `title`, scores, …) plus provenance (`kind`, `rationale`, `sources[]`, `generatedAt`) carried in extra keys (which Threlmark preserves).
- **Disk *or* REST, with fallback** — a `ThrelmarkSource` abstraction picks `DiskSource` (default, writes straight to `~/.threlmark`) or `RestSource` (calls Threlmark's REST API); REST write-back **falls back to the disk writer** if the server is unreachable, so a suggestion is never lost.
- **Config + env** — a `settings.json` + env precedence: `IDEACLYST_ROADMAP_SOURCE` (`disk`|`rest`), `THRELMARK_DATA_DIR` / `IDEACLYST_ROADMAP_DIR` (data root), `IDEACLYST_THRELMARK_API` (REST base URL).

IdeaClyst ships this as its **Roadmap Intelligence** feature: pick a Threlmark project, and three research lanes — **Features**, **Spin-offs**, and **Services** — analyze the roadmap's gap map and scout the live web, then propose scored suggestions you review and send back into Threlmark's Inbox. It works against the disk store directly, or over Threlmark's REST API (with disk fallback), selectable in IdeaClyst's settings.

### What the two can do together — the loop
```
IdeaClyst reads a Threlmark project's roadmap + gap map
   → researches Features / Spin-offs / Services for that project
   → writes scored suggestions into projects/<id>/suggestions/
Threlmark Inbox surfaces them → you Accept (→ item, source:"ideaclyst")
   → rank it → hand it off to Claude/Codex
   → the agent builds it AND reports back → card auto-moves to Done
   → Flow counts brief → shipped; gaps shrink; IdeaClyst sees the updated roadmap next time
```
So IdeaClyst proposes *what* to build (grounded in research + your roadmap's gaps), and Threlmark decides *when*, drives it to done, and measures the flow. Any other tool can join the same loop just by reading the contract and dropping `suggestions/` (and, optionally, `reports/`) files — see the [shared data contract](#the-shared-data-contract).

## Hosting

Threlmark is local-first by design. See **[`docs/HOSTING.md`](docs/HOSTING.md)** for how to publish the marketing site, and what offering a *hosted* version of the tool itself would require.

## License

[MIT](LICENSE) © 2026 Thorsten Meyer. Use it, fork it, build on it.

---

© 2026 Threlmark · Thorsten Meyer · Powered by [Thorsten Meyer AI](https://thorstenmeyerai.com/)
