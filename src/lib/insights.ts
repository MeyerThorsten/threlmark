/**
 * Decision intelligence — risk register, throughput forecast, decision log and
 * outcome ledger. Everything here is DERIVED at read time from data the store
 * already records (transitions, due dates, handoffs, links, comments,
 * outcomes): no new on-disk state, no bookkeeping to drift.
 *
 * The pure functions (`assessRisks`, `forecastCompletion`) take explicit
 * inputs + an optional `now`/`rng` so they are deterministic and unit-testable.
 */

import { listAllComments } from "./comments/store";
import {
  isOverdue,
  isStale,
  isStalledBrief,
  itemAgeMs,
  lastEnteredLaneAt,
  weekStart,
} from "./flow";
import { summarizeInitiatives, type InitiativeSummary } from "./initiatives";
import { listItemViews } from "./items/store";
import { makeAddress } from "./ids";
import { listLinks } from "./links/store";
import { getProject, listProjects } from "./projects/store";
import {
  LANE_LABELS,
  type ItemComment,
  type Lane,
  type Link,
  type RoadmapItemView,
} from "./schema/types";

const DAY_MS = 24 * 3600 * 1000;
const WEEK_MS = 7 * DAY_MS;

// ---------------------------------------------------------------------------
// Risk register
// ---------------------------------------------------------------------------

export const RISK_KINDS = [
  "overdue",
  "due-soon",
  "stale-development",
  "wip-over-limit",
  "stalled-handoff",
  "bottleneck",
  "idea-pileup",
  "throughput-stall",
] as const;
export type RiskKind = (typeof RISK_KINDS)[number];

export type RiskSeverity = "high" | "medium" | "low";
const SEVERITY_RANK: Record<RiskSeverity, number> = { high: 0, medium: 1, low: 2 };

/** One derived risk signal: what, how bad, why, and what to do about it. */
export interface RiskSignal {
  kind: RiskKind;
  severity: RiskSeverity;
  title: string;
  detail: string;
  action: string;
  projectId?: string;
  projectName?: string;
  itemIds: string[];
}

export interface AssessRisksOptions {
  wipLimits?: Partial<Record<Lane, number>>;
  /** Cross-project links; enables the bottleneck signal. */
  links?: Link[];
  projectId?: string;
  projectName?: string;
  now?: number;
}

function days(ms: number): number {
  return Math.max(0, Math.round(ms / DAY_MS));
}

/** Derive the severity-ranked risk register for one project's items. */
export function assessRisks(
  items: RoadmapItemView[],
  opts: AssessRisksOptions = {},
): RiskSignal[] {
  const now = opts.now ?? Date.now();
  const risks: RiskSignal[] = [];
  const where = { projectId: opts.projectId, projectName: opts.projectName };
  const open = items.filter((it) => it.status !== "done");

  // Per-item date risks
  for (const it of open) {
    if (isOverdue(it, now)) {
      const overdueBy = days(now - Date.parse(`${it.dueDate}T23:59:59`));
      risks.push({
        kind: "overdue",
        severity: "high",
        title: `Overdue: ${it.title}`,
        detail: `Due ${it.dueDate} — ${overdueBy} day${overdueBy === 1 ? "" : "s"} past due in ${LANE_LABELS[it.status]}.`,
        action: "Finish it, re-date it, or consciously drop it — an ignored due date erodes every other one.",
        ...where,
        itemIds: [it.id],
      });
    } else if (it.dueDate) {
      const until = Date.parse(`${it.dueDate}T23:59:59`) - now;
      if (until <= 3 * DAY_MS) {
        risks.push({
          kind: "due-soon",
          severity: it.status === "development" ? "medium" : "high",
          title: `Due soon: ${it.title}`,
          detail: `Due ${it.dueDate} (${days(until)} day${days(until) === 1 ? "" : "s"} left), currently in ${LANE_LABELS[it.status]}.`,
          action:
            it.status === "development"
              ? "Keep it moving — it is due within 3 days."
              : "It is due within 3 days but not in Development yet — start it or re-date it.",
          ...where,
          itemIds: [it.id],
        });
      }
    }
  }

  // Stale work (highest cost in Development: it blocks the WIP slot)
  for (const it of open) {
    if (!isStale(it, now)) continue;
    risks.push({
      kind: "stale-development",
      severity: it.status === "development" ? "high" : "low",
      title: `Stale in ${LANE_LABELS[it.status]}: ${it.title}`,
      detail: `Sitting in ${LANE_LABELS[it.status]} for ${days(itemAgeMs(it, now))} days.`,
      action:
        it.status === "development"
          ? "It occupies a WIP slot without progress — unblock it, split it, or pull it back to Ranked."
          : "Re-score it or archive it; old unranked work distorts the backlog.",
      ...where,
      itemIds: [it.id],
    });
  }

  // WIP over limit
  for (const lane of ["idea", "ranked", "development"] as Lane[]) {
    const limit = opts.wipLimits?.[lane];
    if (typeof limit !== "number") continue;
    const inLane = items.filter((it) => it.status === lane);
    if (inLane.length <= limit) continue;
    risks.push({
      kind: "wip-over-limit",
      severity: lane === "development" ? "high" : "medium",
      title: `${LANE_LABELS[lane]} over WIP limit (${inLane.length}/${limit})`,
      detail: `${inLane.length} items against a limit of ${limit}.`,
      action: "Stop starting, start finishing: close or demote items before pulling new work.",
      ...where,
      itemIds: inLane.map((it) => it.id),
    });
  }

  // Stalled handoffs
  for (const it of open) {
    if (!isStalledBrief(it, now)) continue;
    const ageDays = days(now - Date.parse(it.handoff!.at));
    risks.push({
      kind: "stalled-handoff",
      severity: "high",
      title: `Stalled handoff: ${it.title}`,
      detail: `Handed to ${it.handoff!.agent} ${ageDays} days ago and still not Done.`,
      action: "Check the agent's last report; re-run the brief or take the item back.",
      ...where,
      itemIds: [it.id],
    });
  }

  // Dependency bottlenecks (open items that block other open items)
  if (opts.links?.length && opts.projectId) {
    const openById = new Map(open.map((it) => [makeAddress(opts.projectId!, it.id), it]));
    const blocks = new Map<string, number>();
    for (const link of opts.links) {
      if (link.kind !== "blocks") continue;
      if (openById.has(link.from)) {
        blocks.set(link.from, (blocks.get(link.from) ?? 0) + 1);
      }
    }
    for (const [address, count] of blocks) {
      const it = openById.get(address)!;
      risks.push({
        kind: "bottleneck",
        severity: count >= 2 ? "high" : "medium",
        title: `Bottleneck: ${it.title}`,
        detail: `Blocks ${count} other item${count === 1 ? "" : "s"} and is still in ${LANE_LABELS[it.status]}.`,
        action: "Every blocked item inherits this one's delay — prioritize it above its raw score.",
        ...where,
        itemIds: [it.id],
      });
    }
  }

  // Idea pile-up: the funnel front grows while nothing moves through
  const ideas = items.filter((it) => it.status === "idea").length;
  if (ideas >= 15 && ideas > items.length * 0.6) {
    risks.push({
      kind: "idea-pileup",
      severity: "low",
      title: `Idea pile-up (${ideas} unranked ideas)`,
      detail: `${ideas} of ${items.length} items sit unranked in Ideas.`,
      action: "Run “Rank by score”, then dismiss the bottom of the list — a backlog you never rank is a wish list.",
      ...where,
      itemIds: [],
    });
  }

  // Throughput stall: active work but nothing shipped in 3 weeks
  const inDev = items.filter((it) => it.status === "development");
  if (inDev.length > 0) {
    const lastDone = items
      .map((it) => lastEnteredLaneAt(it, "done"))
      .filter((d): d is string => !!d)
      .sort()
      .pop();
    const stalled = !lastDone || now - Date.parse(lastDone) > 21 * DAY_MS;
    if (stalled) {
      risks.push({
        kind: "throughput-stall",
        severity: "medium",
        title: "Nothing shipped in 3+ weeks",
        detail: lastDone
          ? `${inDev.length} item${inDev.length === 1 ? "" : "s"} in Development, last Done on ${lastDone.slice(0, 10)}.`
          : `${inDev.length} item${inDev.length === 1 ? "" : "s"} in Development and nothing has ever reached Done.`,
        action: "Pick the closest-to-done item and finish it; a stalled board hides inside busy lanes.",
        ...where,
        itemIds: inDev.map((it) => it.id),
      });
    }
  }

  return risks.sort(
    (a, b) =>
      SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
      a.kind.localeCompare(b.kind) ||
      a.title.localeCompare(b.title),
  );
}

// ---------------------------------------------------------------------------
// Throughput forecast (Monte Carlo)
// ---------------------------------------------------------------------------

export interface Forecast {
  /** Open items counted against the forecast (ranked + development). */
  remaining: number;
  /** Items finished per week over the sampled history (most recent last). */
  weeklyRates: number[];
  avgPerWeek: number;
  p50Weeks: number;
  p85Weeks: number;
  p50Date: string;
  p85Date: string;
  runs: number;
}

export interface ForecastResult {
  forecast: Forecast | null;
  /** Why there is no forecast (thin history / empty backlog). */
  reason?: string;
}

/** Deterministic PRNG (mulberry32) so forecasts are reproducible in tests. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FORECAST_CAP_WEEKS = 104;

/**
 * Monte Carlo forecast: sample real weekly throughput from the last `weeks`
 * full weeks until the remaining backlog drains. Honest by construction —
 * with fewer than 2 weeks of non-zero history it refuses to invent a date.
 */
export function forecastCompletion(
  items: RoadmapItemView[],
  opts: { now?: number; weeks?: number; runs?: number; rng?: () => number } = {},
): ForecastResult {
  const now = opts.now ?? Date.now();
  const weeks = opts.weeks ?? 12;
  const runs = opts.runs ?? 1000;
  const rng = opts.rng ?? mulberry32(0x7472656c); // "trel"

  const remaining = items.filter(
    (it) => it.status === "ranked" || it.status === "development",
  ).length;
  if (remaining === 0) {
    return { forecast: null, reason: "Nothing in Ranked or Development to forecast." };
  }

  // Weekly throughput history (current partial week excluded — it would bias low).
  const currentWeek = weekStart(now);
  const starts: string[] = [];
  for (let i = weeks; i >= 1; i--) starts.push(weekStart(now - i * WEEK_MS));
  const counts = new Map(starts.map((w) => [w, 0]));
  for (const it of items) {
    const doneAt = lastEnteredLaneAt(it, "done");
    if (!doneAt || it.status !== "done") continue;
    const w = weekStart(Date.parse(doneAt));
    if (w !== currentWeek && counts.has(w)) counts.set(w, (counts.get(w) ?? 0) + 1);
  }
  const weeklyRates = starts.map((w) => counts.get(w) ?? 0);
  const nonZero = weeklyRates.filter((r) => r > 0).length;
  if (nonZero < 2) {
    return {
      forecast: null,
      reason: `Not enough throughput history (${nonZero} non-zero week${nonZero === 1 ? "" : "s"} in the last ${weeks}) — finish a few items first.`,
    };
  }

  const samples: number[] = [];
  for (let run = 0; run < runs; run++) {
    let left = remaining;
    let w = 0;
    while (left > 0 && w < FORECAST_CAP_WEEKS) {
      left -= weeklyRates[Math.floor(rng() * weeklyRates.length)];
      w++;
    }
    samples.push(w);
  }
  samples.sort((a, b) => a - b);
  const pct = (p: number) => samples[Math.min(samples.length - 1, Math.floor(samples.length * p))];
  const p50Weeks = pct(0.5);
  const p85Weeks = pct(0.85);
  const toDate = (ws: number) => new Date(now + ws * WEEK_MS).toISOString().slice(0, 10);

  return {
    forecast: {
      remaining,
      weeklyRates,
      avgPerWeek:
        Math.round((weeklyRates.reduce((a, b) => a + b, 0) / weeklyRates.length) * 10) / 10,
      p50Weeks,
      p85Weeks,
      p50Date: toDate(p50Weeks),
      p85Date: toDate(p85Weeks),
      runs,
    },
  };
}

// ---------------------------------------------------------------------------
// Decision log & outcome ledger
// ---------------------------------------------------------------------------

export interface DecisionEntry extends ItemComment {
  itemTitle: string;
}

export interface OutcomeEntry {
  itemId: string;
  projectId: string;
  projectName?: string;
  title: string;
  category: string;
  outcome: string;
  agent?: string;
  doneAt: string | null;
}

function outcomesOf(
  items: RoadmapItemView[],
  projectName?: string,
): OutcomeEntry[] {
  return items
    .filter((it) => it.status === "done" && it.outcome)
    .map((it) => ({
      itemId: it.id,
      projectId: it.projectId,
      projectName,
      title: it.title,
      category: it.category,
      outcome: it.outcome!,
      agent: it.handoff?.agent,
      doneAt: lastEnteredLaneAt(it, "done"),
    }))
    .sort((a, b) => (b.doneAt ?? "").localeCompare(a.doneAt ?? ""));
}

// ---------------------------------------------------------------------------
// Aggregated views (I/O)
// ---------------------------------------------------------------------------

export interface ProjectInsights {
  projectId: string;
  risks: RiskSignal[];
  forecast: ForecastResult;
  decisions: DecisionEntry[];
  outcomes: OutcomeEntry[];
  generatedAt: string;
}

export async function projectInsights(projectId: string): Promise<ProjectInsights | null> {
  const project = await getProject(projectId);
  if (!project) return null;
  const [items, links, comments] = await Promise.all([
    listItemViews(projectId),
    listLinks(),
    listAllComments(projectId),
  ]);
  const titleById = new Map(items.map((it) => [it.id, it.title]));
  const decisions = comments
    .filter((c) => c.kind === "decision")
    .map((c) => ({ ...c, itemTitle: titleById.get(c.itemId) ?? c.itemId }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return {
    projectId,
    risks: assessRisks(items, {
      wipLimits: project.wipLimits,
      links,
      projectId,
      projectName: project.name,
    }),
    forecast: forecastCompletion(items),
    decisions,
    outcomes: outcomesOf(items),
    generatedAt: new Date().toISOString(),
  };
}

/** A label rolled up across every project that uses it. */
export interface PortfolioInitiative extends InitiativeSummary {
  projects: string[];
}

export interface PortfolioInsights {
  projectCount: number;
  risks: RiskSignal[];
  forecast: ForecastResult;
  initiatives: PortfolioInitiative[];
  outcomes: OutcomeEntry[];
  generatedAt: string;
}

export async function portfolioInsights(): Promise<PortfolioInsights> {
  const [projects, links] = await Promise.all([listProjects(), listLinks()]);

  // Fan out per project; merge in the projects' (name-sorted) order so the
  // result is deterministic regardless of which reads finish first.
  const perProject = await Promise.all(
    projects.map(async (p) => {
      const items = await listItemViews(p.id);
      return {
        project: p,
        items,
        outcomes: outcomesOf(items, p.name),
        risks: assessRisks(items, {
          wipLimits: p.wipLimits,
          links,
          projectId: p.id,
          projectName: p.name,
        }),
      };
    }),
  );

  const risks: RiskSignal[] = [];
  const allItems: RoadmapItemView[] = [];
  const outcomes: OutcomeEntry[] = [];
  const projectsByLabel = new Map<string, Set<string>>();

  for (const { project, items, outcomes: o, risks: r } of perProject) {
    allItems.push(...items);
    outcomes.push(...o);
    risks.push(...r);
    for (const it of items) {
      for (const label of it.labels ?? []) {
        if (!projectsByLabel.has(label)) projectsByLabel.set(label, new Set());
        projectsByLabel.get(label)!.add(project.name);
      }
    }
  }

  risks.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
  outcomes.sort((a, b) => (b.doneAt ?? "").localeCompare(a.doneAt ?? ""));

  const initiatives: PortfolioInitiative[] = summarizeInitiatives(allItems).map((s) => ({
    ...s,
    projects: [...(projectsByLabel.get(s.label) ?? [])].sort(),
  }));

  return {
    projectCount: projects.length,
    risks,
    forecast: forecastCompletion(allItems),
    initiatives,
    outcomes: outcomes.slice(0, 30),
    generatedAt: new Date().toISOString(),
  };
}
