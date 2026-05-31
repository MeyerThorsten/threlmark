/**
 * Handoff brief generator. Turns selected roadmap items into file-scoped
 * implementation prompts for Claude/Codex (Markdown with acceptance checkboxes
 * and verification commands), a plain queue text, or raw JSON.
 *
 * Generalizes the original roadmap.html `devMarkdown` / `queueText` generators.
 */

import { byPriorityDesc } from "../priority";
import type { Project, RoadmapItemView } from "../schema/types";

export type HandoffFormat = "markdown" | "text" | "json";

/** Context that turns the brief into an auto-reporting one. */
export interface HandoffReporting {
  baseUrl?: string;
  projectId: string;
  agent?: string;
  reportsDir?: string;
}

function sorted(items: RoadmapItemView[]): RoadmapItemView[] {
  return [...items].sort(byPriorityDesc);
}

/** The reporting protocol appended to a Markdown brief so agents report back. */
function reportingSection(items: RoadmapItemView[], r: HandoffReporting): string[] {
  const agent = r.agent || "claude";
  const base = r.baseUrl?.replace(/\/$/, "") || "http://localhost:3000";
  const dir = r.reportsDir || `~/.threlmark/projects/${r.projectId}/reports`;
  const out: string[] = [
    "## Reporting protocol (required)",
    "",
    "Report status back to Threlmark so the board updates automatically — no manual step. " +
      "Post `started` when you begin an item, then `done` (with a one–two-sentence summary and the " +
      "verification commands you ran) once its acceptance criteria pass — or `blocked` / `failed` with the reason. " +
      "A `done` report moves the card to Done by itself.",
    "",
    "**Preferred — REST API** (Threlmark is running):",
    "```bash",
    `curl -s -X POST ${base}/api/projects/${r.projectId}/items/<ITEM_ID>/report \\`,
    `  -H 'content-type: application/json' \\`,
    `  -d '{"agent":"${agent}","status":"done","summary":"<what changed>","verification":"npm run typecheck && npm run lint && npm run build"}'`,
    "```",
    "",
    "**Fallback — if the API is unreachable, drop a file** (Threlmark ingests it on next load):",
    "```bash",
    `mkdir -p ${dir} && cat > ${dir}/<ITEM_ID>-$(date +%s).json <<'JSON'`,
    `{ "itemId":"<ITEM_ID>", "agent":"${agent}", "status":"done", "summary":"<what changed>", "verification":"..." }`,
    "JSON",
    "```",
    "",
    "**Item IDs** (use the matching `<ITEM_ID>` above):",
    ...sorted(items).map((item, i) => `- ${i + 1}. ${item.title} → \`${item.id}\``),
    "",
  ];
  return out;
}

export function toQueueText(items: RoadmapItemView[]): string {
  if (items.length === 0) return "No items selected.";
  return sorted(items)
    .map((item, i) =>
      [
        `${i + 1}. ${item.title} (${item.category})`,
        `Priority: ${item.priority} | Impact ${item.impact} | Evidence ${item.evidence} | Fit ${item.fit} | Effort ${item.effort}`,
        item.description,
        `Files: ${item.files || "TBD"}`,
        "",
      ].join("\n"),
    )
    .join("\n");
}

export function toMarkdown(
  project: Project,
  items: RoadmapItemView[],
  reporting?: HandoffReporting,
): string {
  if (items.length === 0) return `# ${project.name} — implementation brief\n\nNo items selected.\n`;

  const repoNote = project.repoPath
    ? `Work inside the repo at \`${project.repoPath}\`. `
    : "";

  const lines: string[] = [
    `# ${project.name} — implementation brief`,
    "",
    `${repoNote}Implement only the items below, in priority order. Preserve existing patterns and the project's local-first conventions.`,
    "",
  ];

  sorted(items).forEach((item, i) => {
    const acceptance = item.acceptance.length
      ? item.acceptance
      : ["Feature works as described", "Existing tests still pass"];
    lines.push(
      `## ${i + 1}. ${item.title}`,
      "",
      `- **Item ID:** \`${item.id}\``,
      `- **Priority:** ${item.priority} (impact ${item.impact}, evidence ${item.evidence}, fit ${item.fit}, effort ${item.effort})`,
      `- **Category:** ${item.category}`,
      `- **Lane:** ${item.status}`,
      item.source ? `- **Source:** ${item.source}` : "",
      "",
      item.description || "_No description provided._",
      "",
      `**Target files:** ${item.files || "TBD — locate the relevant modules first."}`,
      "",
      "**Acceptance criteria:**",
      ...acceptance.map((a) => `- [ ] ${a}`),
      "",
    );
  });

  lines.push(
    "## Verification",
    "",
    "Run after each item and before declaring done:",
    "",
    "```bash",
    "npm run typecheck",
    "npm run lint",
    "npm run build",
    "```",
    "",
    "- [ ] `npm run typecheck` is clean",
    "- [ ] `npm run lint` is clean",
    "- [ ] `npm run build` succeeds",
    "",
  );

  if (reporting) lines.push(...reportingSection(items, reporting));

  return lines.join("\n");
}

export function toJson(items: RoadmapItemView[]): string {
  return JSON.stringify(sorted(items), null, 2);
}

export function generateHandoff(
  project: Project,
  items: RoadmapItemView[],
  format: HandoffFormat,
  reporting?: HandoffReporting,
): string {
  switch (format) {
    case "text":
      return toQueueText(items);
    case "json":
      return toJson(items);
    case "markdown":
    default:
      return toMarkdown(project, items, reporting);
  }
}
