# Threlmark: A Local-First, Flow-Based Roadmap Hub — A Technical Deep-Dive

*For engineers, architects, and tool-builders. ~3,000 words.*

## TL;DR

Threlmark is a local-first project & roadmap manager built with Next.js (App Router) and TypeScript. It stores **everything as plain JSON files on disk** — no database, no cloud, no accounts — and treats that on-disk layout as a **public contract** other tools can read and write. On top of a classic four-lane kanban it layers **flow management** (WIP limits, work-item age, cycle time, throughput) and a **closed agent loop**: you hand a card to an AI coding agent, the brief tells the agent how to report back, and a `done` report moves the card to Done by itself. The first external integration, **IdeaClyst**, reads a project's roadmap and writes scored suggestions back into it. This article explains the design decisions and the mechanics behind them.

---

## 1. The problem it solves

If you build many things, your roadmaps fragment. Each project has its own list somewhere — a README, a Notion page, a localStorage kanban, a pile of TODOs. There is no single place to ask "across everything I'm building, what is the single most important thing to do next?" and no consistent way to push work into an AI agent and track whether it actually shipped.

Threlmark generalizes a single-product roadmap (a localStorage "Roadmap Lab" kanban with scored feature cards) into a **multi-project hub**, and then does two things that ordinary kanban tools don't:

1. It makes the **data open and portable** — the source of truth is JSON on your disk, so other tools can participate.
2. It manages **flow**, not just status — and closes the loop with the AI agents that increasingly do the building.

## 2. Local-first, and why "disk is the contract"

The central architectural decision is that **the on-disk layout *is* the API**. The UI and any external tool reach the same files through the same discipline. There is no server-of-record; the files are the record.

The data root defaults to `~/.threlmark` (override with `THRELMARK_DATA_DIR`) — deliberately home-based rather than repo-relative, because it's a shared hub that every one of your apps points at. The layout:

```
~/.threlmark/
  threlmark.json                 # manifest { schemaVersion, createdAt, updatedAt }
  links.json                     # cross-project dependency graph
  projects/<projectId>/
    project.json                 # project metadata + wipLimits + lanePolicies
    board.json                   # lane ordering
    items/<itemId>.json          # ONE roadmap card per file (source of truth)
    suggestions/<sugId>.json     # external-tool drop zone (the Inbox)
    suggestions/.dismissed/      # accepted/dismissed suggestions (audit)
    handoffs/<handoffId>.json    # recorded agent handoffs
    reports/<file>.json          # agent report-back drop-zone (ingested on read)
    ROADMAP.md                   # regenerated human-readable mirror
  shared/items/<itemId>.json     # shared items referenced by many projects
  archive/projects/<projectId>/  # archived projects (still readable)
```

This buys four properties that matter:

- **Inspectability** — every artifact is a file you can `cat`, diff, grep, and commit.
- **Portability & no lock-in** — back it up with `cp`, sync it with Dropbox/Syncthing/git, migrate it trivially.
- **Interoperability** — any tool in any language can join just by reading/writing files.
- **Restartability** — there's no in-memory state to lose; the process is stateless over the files.

### Persistence discipline

Two patterns, ported deliberately from a sibling app's battle-tested code, make file-based state safe:

**Atomic writes.** Every write goes to a temp file in the same directory, then `rename()` over the target. `rename` is atomic on a single filesystem, so a crash mid-write can never truncate the source of truth — you either have the old file or the new one, never a half.

```ts
async function writeFileAtomic(path: string, contents: string) {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
  await writeFile(tmp, contents, "utf8");
  await rename(tmp, path);
}
```

**Read-merge-write with tolerant normalization.** Updates read the current file, spread-merge the patch, preserve `id`/`createdAt`, bump `updatedAt`, and write atomically. Reads are *tolerant*: missing fields get sane defaults, invalid scores are clamped, and **unknown keys are preserved**. That last point is what makes the contract forward-compatible — a newer tool can write extra fields and an older Threlmark round-trips them untouched.

## 3. Why per-item files (and a self-healing board)

A naive design stores a project's roadmap as one `roadmap.json` array. That's a concurrency hazard: every writer must read-merge-write the *whole list*, so two tools writing at once race and clobber. Threlmark instead uses **one file per item** (`items/<itemId>.json`). Single-file atomic writes are collision-free, so an external tool can drop or update an item without coordinating with anyone.

Lane ordering lives separately in `board.json` (ordered arrays of item ids per lane). Crucially, the board **self-heals on read**: it's reconciled against the actual item set, so any item present in `items/` but missing from its status lane is appended, and ids whose files are gone are dropped. The consequence is powerful — *an external tool never has to touch `board.json`*. It writes an item file; the board fixes itself the next time Threlmark reads.

IDs follow a sortable, collision-resistant convention: `projectId = slugify(name)` (stable, human-readable), and `itemId`/`sugId = <timestampMs>-<slug>-<rand6>`. Imported cards keep their original id, so re-importing the same source is idempotent — it updates rather than duplicates. Cross-project references use a global address: `"<projectId>/<itemId>"` (or `"shared/<itemId>"`).

## 4. The data model

A roadmap **item** carries the original Roadmap-Lab card shape plus flow fields:

```ts
interface RoadmapItem {
  schemaVersion: number;            // 2
  id: string; projectId: string;
  title: string;
  category: Category;               // Research | Discovery | Reports | Trends |
                                    // Validation | Build | Distribution |
                                    // Operations | UX | Automation
  status: "idea" | "ranked" | "development" | "done";
  impact: number; evidence: number; fit: number; effort: number;  // 1–5
  description: string;
  files: string;                    // comma-separated target files
  acceptance: string[];             // acceptance criteria
  source?: string;                  // producing tool, e.g. "ideaclyst"
  sharedRef?: string;               // "shared/<itemId>" pointer
  transitions: { to: Status; at: string }[];   // append-only lane history
  handoff?: { handoffId: string; agent: string; at: string };
  reports?: { at: string; agent: string; status: string; summary: string; verification?: string }[];
  createdAt: string; updatedAt: string;
  [extra: string]: unknown;         // unknown keys preserved
}
```

**`priority` is never stored.** It's computed on read so it can't drift from the axes:

```
priority = max(0, round(impact·3 + evidence·2 + fit·2 − effort·1.5))
```

Impact is weighted heaviest; effort is the only axis that subtracts. The formula is reused verbatim from the original tool, so imported cards rank identically (a 5/5/5/4 card scores 29).

### Schema versioning

The current `schemaVersion` is 2. The bump from 1 added `transitions`. Migration is **lazy and per-file**: a v1 item with no history is migrated on read by seeding a single transition from its `createdAt` + current `status`. There's no big-bang migration step and no downtime; old files and external tools that ignore the new fields keep working.

## 5. Flow: the modern-Kanban layer

The original board answered "what column is this in?" That's status tracking. The modern Kanban Method manages **flow** — limit work-in-progress, measure how work moves, improve incrementally. Threlmark adds that as a layer on top of the board, without throwing the board away.

The enabling change is the append-only `transitions[]` history. From it you can derive:

- **Work-item age** = `now − (timestamp of entering the current lane)`. Past a per-lane threshold (development 7d, ranked 21d, idea 60d) the card is flagged **stale** and shows a red badge.
- **Cycle time** = time from first entering *Development* to reaching *Done* (falls back to lead time if it skipped Development).
- **Throughput** = items reaching Done per ISO week, over an 8-week window.
- **WIP** = current count per lane; a lane over its configured `wipLimits` cap is flagged (the header shows `3 / 2` in red).

These are computed by a pure metrics module (no stored aggregates — everything derives from item state, so it can never disagree with the board). A **Flow tab** per project renders throughput, cycle time, aging work, and agent throughput; the home page shows a portfolio-wide flow strip (total WIP, aging count, weekly throughput, stalled briefs).

Deliberately **out of scope**: SLAs/SLEs, SAFe/enterprise portfolio machinery, and deterministic delivery-date forecasting. Threlmark is a solo/small-team builder's tool; importing the enterprise apparatus would trade one kind of wrong-fit for a heavier one.

## 6. The closed agent loop

This is the part that's genuinely 2026-shaped: most of the building is increasingly done by AI coding agents (Claude Code, Codex). Threlmark treats a **handoff as a first-class flow event** and closes the loop so you don't babysit it.

**Handoff.** From a card you generate an implementation brief — a file-scoped Markdown prompt with the description, target files, acceptance criteria as checkboxes, and verification commands (`npm run typecheck && lint && build`). "Generate & mark handed off" records the handoff (`handoffs/<id>.json`), stamps each item with `handoff:{handoffId, agent, at}`, and optionally moves it to Development.

**Report-back.** The brief includes a **reporting protocol**: it tells the agent to report `started` / `done` / `blocked` / `failed` with a summary and the verification commands it ran. The brief carries the exact, ready-to-run commands — the API base URL is auto-detected from the request origin, and per-item IDs are embedded. The agent reports through either of two channels:

- **Preferred — REST:** `POST /api/projects/:id/items/:itemId/report`.
- **Fallback — filesystem:** drop a JSON into the project's `reports/` folder; Threlmark **ingests it on read** (applies the report, moves the file to `reports/.applied`). This makes the loop robust even if the server isn't running at the moment the agent finishes.

A `done` report **auto-moves the card to Done**. The board polls `/reports`, surfaces a live toast (`🤖 claude done: …`), and the card moves on its own. The Flow view then counts **brief → shipped** time, **agent throughput** (handed-off items finished per week, by agent), and **stalled briefs** (handed off, not Done after 7 days). The full loop:

```
rank → hand off (brief tells the agent how to report) →
agent builds AND reports → card lands in Done → Flow counts brief → shipped
```

## 7. Cross-project operations

Because items are globally addressable, Threlmark supports four cross-project moves:

- **Move** an item to another project — the item file is rewritten under the new project, removed from the old, both boards fixed, and any link addresses repointed.
- **Link / depend** — an edge in `links.json` (`blocks` / `relates` / `duplicates`). Blockers get a small bottleneck boost in portfolio ranking and a visual flag.
- **Share** — one canonical card in `shared/items/`, with each consuming project holding a thin `sharedRef` pointer; provenance recorded as `duplicates` links.
- **Promote a suggestion cross-project** — accept an incoming suggestion into a *different* project via `targetProjectId`.

The **Portfolio** ranks every active project's items together by a status-weighted score so in-flight work floats to the top:

```
score = priority · statusWeight  (+ 0.1 · blockedCount · priority)
statusWeight = { development: 1.3, ranked: 1.0, idea: 0.85, done: 0.15 }
```

## 8. The REST API

The UI's server components and external tools call the *same* store functions; the REST API is a thin layer over the identical code path. Highlights:

| Method | Path | Purpose |
|---|---|---|
| `GET`/`POST` | `/api/projects` | list / create |
| `GET`/`PATCH`/`DELETE` | `/api/projects/:id` | get / update / archive |
| `GET`/`POST` | `/api/projects/:id/items` | list (with computed priority) / create |
| `POST` | `/api/projects/:id/items/:itemId/move` | lane move or cross-project move |
| `GET`/`PATCH` | `/api/projects/:id/board` | lane order |
| `GET` `POST` | `/api/projects/:id/suggestions` + `/accept` + `/dismiss` | the Inbox |
| `POST` | `/api/projects/:id/handoff` | generate brief (+ record handoff) |
| `POST`/`GET` | `…/items/:itemId/report` · `…/reports` | agent report-back |
| `GET` | `/api/projects/:id/flow` · `/api/flow` | project & portfolio flow metrics |
| `GET`/`POST` | `/api/links` · `/api/shared` · `/api/portfolio` | cross-project graph + ranking |

Conventions: tolerant body parse → 400; required-field validation → 400; create → 201; mutations return the persisted entity.

## 9. The importer

The original roadmap lived in an HTML file as a JavaScript `const defaults = [ ... ]` array — object literals with unquoted keys, *not* JSON. The importer extracts that array with a string-aware bracket scan and parses it with **JSON5** (never `eval`). Each card becomes an item, keeping its original id so re-import is idempotent; the board reconciles by status afterward. It's the bridge from the old single-product tool to the multi-project hub.

## 10. The IdeaClyst integration — the contract in action

The disk contract isn't theoretical: a sibling app, **IdeaClyst** (an "idea engine" that turns product ideas into founder plans via a Claude↔Codex council and scouts the web for opportunities), plugs straight in. It added a dedicated `src/lib/threlmark/` layer that speaks Threlmark's exact shapes:

- **Reads roadmaps read-only** — lists projects, reads a project's items + `board.json`, computes the *same* priority, and builds a deterministic **gap map** (category coverage, lane counts, under-covered areas).
- **Writes only suggestions** — drops `projects/<id>/suggestions/<id>.json` via the same atomic pattern, in the flat shape Threlmark expects (`source: "ideaclyst"`, `title`, scores, …) plus provenance (`kind`, `rationale`, `sources[]`, `generatedAt`) carried in preserved extra keys.
- **Disk *or* REST, with fallback** — a `ThrelmarkSource` abstraction picks a `DiskSource` (writes straight to `~/.threlmark`) or a `RestSource` (calls the API); REST write-back **falls back to the disk writer** if the server is unreachable, so a suggestion is never lost.
- **Config + env** — selectable via settings + env precedence: `IDEACLYST_ROADMAP_SOURCE` (`disk`|`rest`), `THRELMARK_DATA_DIR`/`IDEACLYST_ROADMAP_DIR`, `IDEACLYST_THRELMARK_API`.

IdeaClyst ships this as **Roadmap Intelligence**: pick a Threlmark project, and three research lanes — **Features / Spin-offs / Services** — analyze the gap map and live web research, then propose scored suggestions that land in Threlmark's Inbox. The loop: IdeaClyst proposes *what* to build → it appears in your Inbox → you accept and rank → hand off to an agent → it ships and reports back → Done → the shrinking gaps shape what IdeaClyst proposes next. **Any tool that speaks the contract can join the same loop** by reading roadmaps and dropping `suggestions/` (and optionally `reports/`) files.

## 11. Privacy, security, and hosting posture

Threlmark is local-first and single-user by design: **no accounts, no auth, no secrets handled, nothing leaves the machine.** That's a feature, but it shapes deployment. The app needs a Node.js runtime (its API reads/writes files at request time), so ordinary static/PHP shared hosting can't run it. Three honest paths: a **static read-only demo** (seeded data, writes to `localStorage`); a **password-gated personal instance** on a small Node host with a persistent, backed-up `THRELMARK_DATA_DIR`; or a **true multi-tenant SaaS** — which would require adding accounts and per-tenant data isolation and is a separate build. The store interface (`src/lib/*/store.ts`) is the natural seam for swapping disk for per-tenant storage.

## 12. Stack and project shape

Next.js App Router + TypeScript; disk JSON as the only state; `json5` used solely by the importer. The library layer (`src/lib`) separates concerns — `fsops`, `paths`, `ids`, `priority`, `flow`, `metrics`, `schema/{types,version,normalize}`, plus per-concern stores (`projects`, `items`, `board`, `suggestions`, `links`, `shared`), `importer`, `handoff/{generate,records}`, `reports`, and `portfolio`. UI server components call the same stores the API does. The result is a small, inspectable codebase where the hardest property — safe concurrent file access as a shared contract — is handled by two disciplined patterns rather than a database.

---

*Threlmark is open source under the MIT license. Source: [github.com/MeyerThorsten/threlmark](https://github.com/MeyerThorsten/threlmark) · Site: [threlmark.com](https://threlmark.com).*

© 2026 Threlmark · Thorsten Meyer · Powered by [Thorsten Meyer AI](https://thorstenmeyerai.com/)
