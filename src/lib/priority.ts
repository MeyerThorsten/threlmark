/**
 * Priority scoring — reused verbatim from the original roadmap.html so imported
 * cards rank identically:
 *
 *   priority = max(0, round(impact*3 + evidence*2 + fit*2 - effort*1.5))
 */

import type { RoadmapItem, RoadmapItemView } from "./schema/types";

export function priority(item: Pick<
  RoadmapItem,
  "impact" | "evidence" | "fit" | "effort"
>): number {
  return Math.max(
    0,
    Math.round(item.impact * 3 + item.evidence * 2 + item.fit * 2 - item.effort * 1.5),
  );
}

/** Attach the computed priority to an item for the UI / API. */
export function withPriority(item: RoadmapItem): RoadmapItemView {
  return { ...item, priority: priority(item) };
}

/** Sort highest priority first; tie-break by most-recently updated, then title. */
export function byPriorityDesc(a: RoadmapItemView, b: RoadmapItemView): number {
  if (b.priority !== a.priority) return b.priority - a.priority;
  if (a.updatedAt !== b.updatedAt) return b.updatedAt.localeCompare(a.updatedAt);
  return a.title.localeCompare(b.title);
}
