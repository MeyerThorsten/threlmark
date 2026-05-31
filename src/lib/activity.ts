/**
 * Builds an item's activity timeline from data Threlmark already records —
 * creation, lane transitions, handoff, and agent reports. Pure; no new storage.
 * (Inspired by Kan's Activity Log, but derived rather than separately tracked.)
 */

import { LANE_LABELS, type RoadmapItem } from "./schema/types";

export type ActivityKind = "create" | "move" | "handoff" | "report";

export interface ActivityEntry {
  at: string;
  kind: ActivityKind;
  label: string;
  detail?: string;
}

export function buildActivity(item: RoadmapItem): ActivityEntry[] {
  const out: ActivityEntry[] = [{ at: item.createdAt, kind: "create", label: "Created" }];

  item.transitions.forEach((t, i) => {
    if (i === 0) return; // first transition is the creation/seed entry
    out.push({ at: t.at, kind: "move", label: `Moved to ${LANE_LABELS[t.to]}` });
  });

  if (item.handoff) {
    out.push({ at: item.handoff.at, kind: "handoff", label: `Handed off to ${item.handoff.agent}` });
  }

  for (const r of item.reports ?? []) {
    out.push({
      at: r.at,
      kind: "report",
      label: `${r.agent} reported ${r.status}`,
      detail: r.summary || undefined,
    });
  }

  return out.sort((a, b) => b.at.localeCompare(a.at));
}
