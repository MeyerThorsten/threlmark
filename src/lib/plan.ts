/**
 * "Plan my day" — one ordered, cross-project work queue. Blends the portfolio
 * score (priority × status weight) with risk boosts derived from the same
 * primitives the risk register uses, so the queue and the register can never
 * disagree about what's urgent. Every boost is also expressed as a human
 * reason, because a plan you can't argue with is a plan you won't trust.
 */

import { isOverdue, isStale, isStalledBrief, itemAgeMs } from "./flow";
import { makeAddress } from "./ids";
import { listItemViews } from "./items/store";
import { listLinks } from "./links/store";
import { STATUS_WEIGHT } from "./portfolio";
import { listProjects } from "./projects/store";
import { LANE_LABELS, type Link, type RoadmapItemView } from "./schema/types";

const DAY_MS = 24 * 3600 * 1000;

/** Additive boosts on top of the status-weighted priority. */
export const PLAN_BOOSTS = {
  overdue: 12,
  dueSoon: 6,
  stalledHandoff: 8,
  blocksEach: 4,
  staleDevelopment: 5,
} as const;

export interface PlanEntry {
  item: RoadmapItemView;
  projectId: string;
  projectName: string;
  projectColor?: string;
  score: number;
  reasons: string[];
}

export interface Plan {
  entries: PlanEntry[];
  totalOpen: number;
  generatedAt: string;
}

/** Pure per-item scoring: status-weighted priority + risk boosts + reasons. */
export function scorePlanEntry(
  item: RoadmapItemView,
  opts: { blocks?: number; now?: number } = {},
): { score: number; reasons: string[] } {
  const now = opts.now ?? Date.now();
  const blocks = opts.blocks ?? 0;
  const reasons: string[] = [];
  let score = item.priority * STATUS_WEIGHT[item.status];

  if (item.status === "development") {
    reasons.push("already in development — finishing beats starting");
  }
  if (isOverdue(item, now)) {
    score += PLAN_BOOSTS.overdue;
    reasons.push(`overdue since ${item.dueDate}`);
  } else if (item.dueDate) {
    const until = Date.parse(`${item.dueDate}T23:59:59`) - now;
    if (until <= 3 * DAY_MS) {
      score += PLAN_BOOSTS.dueSoon;
      reasons.push(`due ${item.dueDate}`);
    }
  }
  if (isStalledBrief(item, now)) {
    score += PLAN_BOOSTS.stalledHandoff;
    reasons.push(`handed to ${item.handoff!.agent} and stalled`);
  }
  if (blocks > 0) {
    score += PLAN_BOOSTS.blocksEach * blocks;
    reasons.push(`blocks ${blocks} other item${blocks === 1 ? "" : "s"}`);
  }
  if (item.status === "development" && isStale(item, now)) {
    score += PLAN_BOOSTS.staleDevelopment;
    reasons.push(`stale — ${Math.round(itemAgeMs(item, now) / DAY_MS)}d in Development`);
  }

  return { score: Math.round(score * 10) / 10, reasons };
}

/** Count how many items each open address blocks. */
export function blockCounts(links: Link[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const link of links) {
    if (link.kind === "blocks") counts.set(link.from, (counts.get(link.from) ?? 0) + 1);
  }
  return counts;
}

export interface BuildPlanOptions {
  limit?: number;
  projectId?: string;
  now?: number;
}

export async function buildPlan(opts: BuildPlanOptions = {}): Promise<Plan> {
  const limit = opts.limit ?? 10;
  const [projects, links] = await Promise.all([listProjects(), listLinks()]);
  const scoped = opts.projectId
    ? projects.filter((p) => p.id === opts.projectId)
    : projects;
  const blocks = blockCounts(links);

  const perProject = await Promise.all(
    scoped.map(async (p) => ({ project: p, items: await listItemViews(p.id) })),
  );

  const entries: PlanEntry[] = [];
  let totalOpen = 0;
  for (const { project, items } of perProject) {
    for (const item of items) {
      if (item.status === "done") continue;
      totalOpen++;
      const { score, reasons } = scorePlanEntry(item, {
        blocks: blocks.get(makeAddress(project.id, item.id)) ?? 0,
        now: opts.now,
      });
      entries.push({
        item,
        projectId: project.id,
        projectName: project.name,
        projectColor: project.color,
        score,
        reasons,
      });
    }
  }

  entries.sort(
    (a, b) =>
      b.score - a.score ||
      b.item.updatedAt.localeCompare(a.item.updatedAt) ||
      a.item.title.localeCompare(b.item.title),
  );

  return {
    entries: entries.slice(0, limit),
    totalOpen,
    generatedAt: new Date().toISOString(),
  };
}

/** The plan as a paste-anywhere markdown checklist. */
export function planMarkdown(plan: Plan): string {
  const lines = [
    `# Plan — ${plan.generatedAt.slice(0, 10)}`,
    "",
    `Top ${plan.entries.length} of ${plan.totalOpen} open items, ranked by score + risk.`,
    "",
  ];
  for (const [i, e] of plan.entries.entries()) {
    lines.push(
      `- [ ] **${i + 1}. ${e.item.title}** — ${e.projectName} · ${LANE_LABELS[e.item.status]} · score ${e.score}`,
    );
    for (const reason of e.reasons) lines.push(`  - ${reason}`);
  }
  return lines.join("\n") + "\n";
}
