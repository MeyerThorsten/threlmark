# The Operator Loop — MCP, Plan, Palette, Automations, Snapshots, Digest, Doctor

> Seven features that close the daily loop: agents get native tools, you get a decided plan, every event can trigger the outside world, and the week reviews itself.
> Visual companion: [`operator-loop.html`](operator-loop.html) · initiative label: `operator-loop`

| Feature | Surface | Where |
| --- | --- | --- |
| MCP server | 12 agent tools over stdio | `scripts/threlmark-mcp.mjs`, `.mcp.json`, `npm run mcp` |
| Plan my day | risk-aware work queue | `/plan`, `GET /api/plan` |
| Command palette | ⌘K everywhere | global, `GET /api/search` |
| Webhooks & rules | event automation | `~/.threlmark/automations.json` |
| Snapshots | shareable read-only board | `GET /api/projects/:id/snapshot` |
| Weekly digest | week in review, md + html | `GET /api/digest`, `/insights` |
| Doctor & backup | store integrity + archives | `npm run doctor`, `npm run backup` |

---

## 1. MCP server — the board as first-class agent tools

`scripts/threlmark-mcp.mjs` is a stdio MCP server that proxies the local HTTP API, so every tool call goes through the same normalization, board reconciliation and event emission as the UI. Configure once (the repo ships `.mcp.json` preconfigured):

```json
{ "mcpServers": { "threlmark": {
    "command": "node",
    "args": ["scripts/threlmark-mcp.mjs"],
    "env": { "THRELMARK_URL": "http://localhost:3000" } } } }
```

**Tools (12):** `list_projects`, `list_items` (filter by lane/label), `create_item`, `update_item`, `move_item`, `post_report`, `list_suggestions`, `create_suggestion`, `accept_suggestion`, `get_insights`, `get_plan`, `search`.

The shape matters more than the list: an agent session can now run the whole loop natively — `get_plan` to pick the riskiest work, `move_item` to pull it into Development, build, `post_report` with status `done` (card auto-moves, outcome recorded), and `create_suggestion` to politely propose follow-ups into the Inbox instead of unilaterally adding work. Anything a user can do on the board, an agent can do through tools.

## 2. Plan my day — the queue that argues its case

`/plan` (sidebar: **▸ Plan my day**) ranks every open item across every project:

```
score = priority × status-weight        (in-flight work floats up)
      + 12 if overdue                   + 6 if due within 3 days
      + 8 if a handed-off brief stalled + 4 × items it blocks
      + 5 if stale in Development
```

Each entry lists its reasons in plain language ("overdue since 2026-06-01", "blocks 2 other items", "already in development — finishing beats starting") — a plan you can argue with is a plan you'll trust. **Copy as markdown** produces a checklist brief; `GET /api/plan?format=md` gives agents the same thing. Clicking an entry deep-links to its board with the editor open.

## 3. ⌘K command palette + global search

⌘K (or Ctrl+K, or the sidebar button) opens the palette anywhere: jump to any project or view, or type 2+ characters to search **items, inbox suggestions, decision notes and recorded outcomes** across all projects. Ranking is explainable: title prefix > title > label > category > body. Enter navigates; item results land on the board with `?focus=<itemId>`, which opens the card's editor automatically. The same index is `GET /api/search?q=…` and the MCP `search` tool.

## 4. Webhooks & automation rules

One optional file, `~/.threlmark/automations.json`:

```json
{
  "webhooks": [
    { "url": "https://example.test/hook", "events": ["item.done", "report.received"] }
  ],
  "rules": [
    { "on": "item.moved", "toLane": "development", "addLabels": ["wip"] },
    { "on": "report.received", "projectId": "acme", "addLabels": ["agent-touched"] }
  ]
}
```

- **Events:** `item.created`, `item.moved`, `item.done`, `report.received`, `handoff.recorded`. Payload = `{type, at, projectId, itemId, item:{id,title,status,category,labels}, data}` with an `X-Threlmark-Event` header.
- **Webhooks** are fire-and-forget (3 s timeout) — a slow endpoint can never slow the board. Every delivery attempt (and rule application) is appended to `~/.threlmark/events.log` as JSONL.
- **Rules** match on event type (`"*"` works), destination lane, an existing label, and/or project — and add labels. Combined with initiatives, that's live tracking: a rule that labels everything an agent reports on builds its own rollup.
- Automations can never break a mutation: the emitter swallows all errors by design.

## 5. Read-only snapshots

**⬇ Snapshot** in any project header (or `GET /api/projects/:id/snapshot`, `?download=1` for an attachment) renders the entire board as **one self-contained HTML file**: all four lanes, priorities, labels, initiative progress, generation timestamp. No scripts, no external requests — safe to email a client or drop on any static host. The roadmap travels without the app.

## 6. Weekly digest

`GET /api/digest` builds the week in review from item history (no bookkeeping): **shipped** (with outcomes and agent attribution), **started**, **new items**, the current **risk register**, the **forecast**, and open **initiatives**.

- `?format=html` — a clean shareable page (linked from `/insights`)
- `?format=md` — paste into notes/standups
- `?days=30` — monthly review
- `?save=1` — writes dated `digest-YYYY-MM-DD.md` + `.html` into `~/.threlmark/digests/` (cron-friendly: `curl -s "localhost:3000/api/digest?save=1" > /dev/null`)

## 7. Doctor & backup

```bash
npm run doctor   # read-only integrity check; exit 1 on errors (cron/CI-friendly)
npm run backup   # tar.gz of the data root → ~/.threlmark/backups/, keeps newest 10
```

The doctor checks: malformed JSON, `project.json` sanity, item id↔filename and `projectId`↔directory mismatches, board references to missing items, dangling link addresses. It reports, never repairs — your files, your call. *(On its first run against the real store it found 12 items with a wrongly-cased `projectId` written by an external tool — found and fixed the same hour.)* Backups rotate (`THRELMARK_BACKUP_KEEP` overrides the count of 10); restoring is just extracting, because the store is plain files.

---

## Design notes

- **Same primitives everywhere.** The plan reuses the risk logic of the Insights register and the portfolio status weights; the digest reuses transitions, risks and the forecast; search reuses the stores. New surfaces, no new state.
- **Events are best-effort by contract.** `emitEvent` never throws and webhook delivery is detached — board mutations stay fast and reliable whether or not automations exist.
- **Everything is agent-readable.** `/api/plan`, `/api/search`, `/api/digest`, `/api/projects/:id/snapshot` are plain HTTP like the rest; the MCP server is a thin veneer over them.
- **Tested:** 48 unit tests cover rule matching, webhook delivery (injected fetch), plan boosts, search ranking, digest/snapshot rendering, and the doctor against seeded corruption (`src/lib/__tests__/operator.test.ts`, `doctor.test.ts`). MCP and webhooks additionally verified end-to-end against the live app.
