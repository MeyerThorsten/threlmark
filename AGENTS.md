<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Initiatives

An item's `labels: string[]` are the **flag/initiative mechanism**: each distinct label is surfaced as a first-class, trackable sub-roadmap — an Initiatives strip with progress (done/total, %) and click-to-focus, reusing the existing label filter. It is a pure read-time rollup (`src/lib/initiatives.ts`, `summarizeInitiatives`) with **no schema or API change** — `labels` remain the only storage. To put work in an initiative (e.g. `vNext`), set/extend an item's (or a suggestion's) `labels`; don't add new fields. See `docs/initiatives.md`.
