/**
 * Initiatives — a derived rollup that turns the free-form item `labels` field
 * into first-class, trackable sub-roadmaps within a single project. Pure and
 * deterministic: no I/O, no schema/store changes — just a read-time aggregation
 * over the items already in the board.
 */

import { LANES, type Lane, type RoadmapItemView } from "@/lib/schema/types";

/** A single label's rollup across all items that carry it. */
export interface InitiativeSummary {
  label: string;
  total: number;
  done: number;
  open: number;
  pctDone: number;
  prioritySum: number;
  byLane: Record<Lane, number>;
}

/**
 * Aggregate every distinct label across `items` into an InitiativeSummary. An
 * item with N labels contributes to EACH of its labels. Items with no labels
 * are ignored. Results are sorted by total DESC, then label ASC.
 */
export function summarizeInitiatives(items: RoadmapItemView[]): InitiativeSummary[] {
  const byLabel = new Map<string, InitiativeSummary>();

  for (const item of items) {
    for (const label of item.labels ?? []) {
      let summary = byLabel.get(label);
      if (!summary) {
        summary = {
          label,
          total: 0,
          done: 0,
          open: 0,
          pctDone: 0,
          prioritySum: 0,
          byLane: Object.fromEntries(LANES.map((lane) => [lane, 0])) as Record<Lane, number>,
        };
        byLabel.set(label, summary);
      }
      summary.total += 1;
      if (item.status === "done") summary.done += 1;
      summary.prioritySum += item.priority;
      summary.byLane[item.status] += 1;
    }
  }

  const summaries = [...byLabel.values()];
  for (const summary of summaries) {
    summary.open = summary.total - summary.done;
    // 0% only when nothing is done, 100% only when truly complete; in between, round
    // but clamp to [1, 99] so partial progress never reads as a misleading 0% or 100%.
    summary.pctDone =
      summary.done === 0
        ? 0
        : summary.done === summary.total
          ? 100
          : Math.min(99, Math.max(1, Math.round((summary.done / summary.total) * 100)));
  }

  return summaries.sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));
}
