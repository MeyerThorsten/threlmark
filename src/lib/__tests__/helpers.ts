/** Shared test fixtures: fabricate valid items without touching the disk. */

import { withPriority } from "@/lib/priority";
import type {
  RoadmapItem,
  RoadmapItemView,
  Status,
  Transition,
} from "@/lib/schema/types";

export const NOW = Date.parse("2026-06-10T12:00:00.000Z");
const DAY = 24 * 3600 * 1000;

export function daysAgo(n: number): string {
  return new Date(NOW - n * DAY).toISOString();
}

let seq = 0;

export function makeItem(over: Partial<RoadmapItem> = {}): RoadmapItemView {
  seq += 1;
  const status = (over.status ?? "idea") as Status;
  const createdAt = over.createdAt ?? daysAgo(10);
  const transitions: Transition[] =
    (over.transitions as Transition[] | undefined) ?? [{ to: status, at: createdAt }];
  const item: RoadmapItem = {
    schemaVersion: 2,
    id: over.id ?? `it-${seq}`,
    projectId: over.projectId ?? "proj",
    title: over.title ?? `Item ${seq}`,
    category: over.category ?? "Build",
    status,
    impact: over.impact ?? 4,
    evidence: over.evidence ?? 3,
    fit: over.fit ?? 4,
    effort: over.effort ?? 3,
    description: over.description ?? "",
    files: over.files ?? "",
    acceptance: over.acceptance ?? [],
    labels: over.labels,
    dueDate: over.dueDate,
    scheduledFor: over.scheduledFor,
    source: over.source,
    sharedRef: over.sharedRef,
    transitions,
    handoff: over.handoff,
    reports: over.reports,
    outcome: over.outcome,
    createdAt,
    updatedAt: over.updatedAt ?? createdAt,
  };
  return withPriority(item);
}

/** An item finished `doneDaysAgo` days ago after `devDays` in Development. */
export function doneItem(doneDaysAgo: number, devDays = 2, over: Partial<RoadmapItem> = {}) {
  return makeItem({
    status: "done",
    transitions: [
      { to: "idea", at: daysAgo(doneDaysAgo + devDays + 5) },
      { to: "development", at: daysAgo(doneDaysAgo + devDays) },
      { to: "done", at: daysAgo(doneDaysAgo) },
    ],
    ...over,
  });
}
