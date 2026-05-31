/**
 * Pure flow helpers, shared by the server (metrics) and the client (card
 * badges). Everything derives from an item's append-only `transitions` history,
 * so no extra state is needed.
 */

import {
  STALE_THRESHOLDS_MS,
  STALLED_BRIEF_MS,
  type Lane,
  type RoadmapItem,
} from "./schema/types";

function ts(iso: string): number {
  const n = Date.parse(iso);
  return Number.isNaN(n) ? 0 : n;
}

/** When the item most recently entered its current lane. */
export function enteredCurrentLaneAt(item: RoadmapItem): string {
  const t = item.transitions;
  return t.length ? t[t.length - 1].at : item.createdAt;
}

/** First time the item entered a given lane (null if never). */
export function firstEnteredLaneAt(item: RoadmapItem, lane: Lane): string | null {
  const t = item.transitions.find((x) => x.to === lane);
  return t ? t.at : null;
}

/** Most recent time the item reached a given lane (null if never). */
export function lastEnteredLaneAt(item: RoadmapItem, lane: Lane): string | null {
  for (let i = item.transitions.length - 1; i >= 0; i--) {
    if (item.transitions[i].to === lane) return item.transitions[i].at;
  }
  return null;
}

/** Time (ms) the item has spent in its current lane. */
export function timeInLaneMs(item: RoadmapItem, now = Date.now()): number {
  return Math.max(0, now - ts(enteredCurrentLaneAt(item)));
}

/** Work-item age = time in current lane. */
export const itemAgeMs = timeInLaneMs;

/**
 * Cycle time (ms): from first entering Development to reaching Done. Falls back
 * to lead time (createdAt → Done) if it never passed through Development.
 * Returns null while the item is not Done.
 */
export function cycleTimeMs(item: RoadmapItem): number | null {
  const doneAt = lastEnteredLaneAt(item, "done");
  if (!doneAt) return null;
  const start = firstEnteredLaneAt(item, "development") ?? item.createdAt;
  return Math.max(0, ts(doneAt) - ts(start));
}

/** Lead time (ms): creation → Done. Null while not Done. */
export function leadTimeMs(item: RoadmapItem): number | null {
  const doneAt = lastEnteredLaneAt(item, "done");
  return doneAt ? Math.max(0, ts(doneAt) - ts(item.createdAt)) : null;
}

export function isStale(item: RoadmapItem, now = Date.now()): boolean {
  if (item.status === "done") return false;
  return timeInLaneMs(item, now) > STALE_THRESHOLDS_MS[item.status];
}

export function isStalledBrief(item: RoadmapItem, now = Date.now()): boolean {
  if (!item.handoff || item.status === "done") return false;
  return now - ts(item.handoff.at) > STALLED_BRIEF_MS;
}

function endOfDate(date: string): number {
  const n = Date.parse(`${date}T23:59:59.999`);
  return Number.isNaN(n) ? Number.POSITIVE_INFINITY : n;
}

export function isOverdue(item: Pick<RoadmapItem, "dueDate" | "status">, now = Date.now()): boolean {
  if (!item.dueDate || item.status === "done") return false;
  return endOfDate(item.dueDate) < now;
}

export function humanDate(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  return Number.isNaN(d.getTime())
    ? date
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** ms → compact human label, e.g. "3d", "5h", "just now". */
export function humanAge(ms: number): string {
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 14) return `${d}d`;
  const w = Math.floor(d / 7);
  return `${w}w`;
}

/** Monday-anchored ISO date (YYYY-MM-DD) for the week containing `ms`. */
export function weekStart(ms: number): string {
  const d = new Date(ms);
  const day = (d.getUTCDay() + 6) % 7; // 0 = Monday
  d.setUTCDate(d.getUTCDate() - day);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}
