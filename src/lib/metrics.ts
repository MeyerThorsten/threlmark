/**
 * Flow metrics. Everything is derived from item `transitions` + `handoff`, so
 * metrics stay consistent with the board and need no separate bookkeeping.
 */

import {
  cycleTimeMs,
  isStale,
  isStalledBrief,
  itemAgeMs,
  lastEnteredLaneAt,
  weekStart,
} from "./flow";
import { listItems } from "./items/io";
import { getProject, listProjects } from "./projects/store";
import {
  AGENTS,
  LANES,
  type Agent,
  type AgingItem,
  type FlowMetrics,
  type Lane,
  type PortfolioFlow,
  type ProjectFlow,
  type RoadmapItem,
  type StalledBrief,
  type ThroughputBucket,
} from "./schema/types";

const WEEK_MS = 7 * 24 * 3600 * 1000;

function lastNWeekStarts(now: number, n: number): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) out.push(weekStart(now - i * WEEK_MS));
  return out;
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

function bucketByWeek(dates: string[], weeks: string[]): ThroughputBucket[] {
  const counts = new Map(weeks.map((w) => [w, 0]));
  for (const iso of dates) {
    const w = weekStart(Date.parse(iso));
    if (counts.has(w)) counts.set(w, (counts.get(w) ?? 0) + 1);
  }
  return weeks.map((w) => ({ weekStart: w, count: counts.get(w) ?? 0 }));
}

export function computeFlow(
  items: RoadmapItem[],
  opts: {
    wipLimits?: Partial<Record<Lane, number>>;
    weeks?: number;
    now?: number;
    projectNameById?: Map<string, string>;
  } = {},
): FlowMetrics {
  const now = opts.now ?? Date.now();
  const weeks = lastNWeekStarts(now, opts.weeks ?? 8);
  const nameOf = (id: string) => opts.projectNameById?.get(id);

  // WIP + over-limit
  const wip = { idea: 0, ranked: 0, development: 0, done: 0 } as Record<Lane, number>;
  for (const it of items) wip[it.status]++;
  const overLimit: FlowMetrics["overLimit"] = {};
  for (const lane of LANES) {
    const limit = opts.wipLimits?.[lane];
    if (typeof limit === "number" && wip[lane] > limit) {
      overLimit[lane] = { count: wip[lane], limit };
    }
  }

  // Cycle time (done items)
  const cycleSamples: number[] = [];
  const doneDates: string[] = [];
  for (const it of items) {
    const c = cycleTimeMs(it);
    if (c !== null) cycleSamples.push(c);
    const d = lastEnteredLaneAt(it, "done");
    if (d) doneDates.push(d);
  }

  // Agent throughput (handed-off items that reached Done)
  const agentThroughput = AGENTS.map((agent: Agent) => {
    const dates = items
      .filter((it) => it.handoff?.agent === agent && it.status === "done")
      .map((it) => lastEnteredLaneAt(it, "done"))
      .filter((d): d is string => !!d);
    return { agent, weeks: bucketByWeek(dates, weeks), total: dates.length };
  }).filter((a) => a.total > 0);

  // Aging (active items, oldest first)
  const aging: AgingItem[] = items
    .filter((it) => it.status !== "done")
    .map((it) => ({
      id: it.id,
      title: it.title,
      projectId: it.projectId,
      projectName: nameOf(it.projectId),
      status: it.status,
      ageMs: itemAgeMs(it, now),
      stale: isStale(it, now),
    }))
    .sort((a, b) => b.ageMs - a.ageMs);

  // Stalled briefs
  const stalled: StalledBrief[] = items
    .filter((it) => isStalledBrief(it, now))
    .map((it) => ({
      id: it.id,
      title: it.title,
      projectId: it.projectId,
      projectName: nameOf(it.projectId),
      agent: it.handoff!.agent,
      ageMs: now - Date.parse(it.handoff!.at),
    }))
    .sort((a, b) => b.ageMs - a.ageMs);

  return {
    wip,
    overLimit,
    cycleTimeMedianMs: median(cycleSamples),
    cycleTimeSamples: cycleSamples.length,
    throughput: bucketByWeek(doneDates, weeks),
    agentThroughput,
    aging,
    stalled,
  };
}

export async function projectFlow(projectId: string): Promise<ProjectFlow | null> {
  const project = await getProject(projectId);
  if (!project) return null;
  const items = await listItems(projectId);
  const metrics = computeFlow(items, { wipLimits: project.wipLimits });
  return { ...metrics, projectId, wipLimits: project.wipLimits ?? {} };
}

export async function portfolioFlow(): Promise<PortfolioFlow> {
  const projects = await listProjects();
  const nameById = new Map(projects.map((p) => [p.id, p.name]));
  const all: RoadmapItem[] = [];
  for (const p of projects) all.push(...(await listItems(p.id)));
  const metrics = computeFlow(all, { projectNameById: nameById });
  return { ...metrics, generatedAt: new Date().toISOString(), projectCount: projects.length };
}
