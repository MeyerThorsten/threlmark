/** Renders the human-readable ROADMAP.md mirror for a project. */

import { LANES, LANE_LABELS, type Lane, type RoadmapItemView } from "./schema/types";

export function roadmapMarkdown(projectId: string, items: RoadmapItemView[]): string {
  const byLane = new Map<Lane, RoadmapItemView[]>();
  for (const lane of LANES) byLane.set(lane, []);
  for (const item of items) byLane.get(item.status)?.push(item);

  const lines: string[] = [`# ${projectId} — roadmap`, ""];
  for (const lane of LANES) {
    const laneItems = (byLane.get(lane) ?? []).sort((a, b) => b.priority - a.priority);
    lines.push(`## ${LANE_LABELS[lane]} (${laneItems.length})`, "");
    if (laneItems.length === 0) {
      lines.push("_empty_", "");
      continue;
    }
    for (const item of laneItems) {
      lines.push(
        `- **${item.title}** · priority ${item.priority} · ${item.category}` +
          (item.source ? ` · from ${item.source}` : ""),
      );
      if (item.description) lines.push(`  - ${item.description}`);
      if (item.files) lines.push(`  - Files: ${item.files}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}
