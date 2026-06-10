/**
 * Cross-project portfolio. Ranks every active project's items by a status-
 * weighted priority so in-flight work floats to the top, and overlays the
 * cross-project dependency edges. Items that block others get a small boost so
 * bottlenecks surface.
 */

import { makeAddress } from "./ids";
import { listItemViews } from "./items/store";
import { listLinks } from "./links/store";
import { listProjects } from "./projects/store";
import {
  type Portfolio,
  type PortfolioEntry,
  type Status,
} from "./schema/types";

const STATUS_WEIGHT: Record<Status, number> = {
  development: 1.3,
  ranked: 1.0,
  idea: 0.85,
  done: 0.15,
};

export async function buildPortfolio(): Promise<Portfolio> {
  const [projects, links] = await Promise.all([listProjects(), listLinks()]);

  // How many items each address blocks (kind === "blocks", counted at the source).
  const blockCount = new Map<string, number>();
  for (const link of links) {
    if (link.kind === "blocks") {
      blockCount.set(link.from, (blockCount.get(link.from) ?? 0) + 1);
    }
  }

  const perProject = await Promise.all(
    projects.map(async (project) => ({ project, items: await listItemViews(project.id) })),
  );

  const entries: PortfolioEntry[] = [];
  for (const { project, items } of perProject) {
    for (const item of items) {
      const address = makeAddress(project.id, item.id);
      const blocks = blockCount.get(address) ?? 0;
      const base = item.priority * STATUS_WEIGHT[item.status];
      const score = Math.round((base + 0.1 * blocks * item.priority) * 10) / 10;
      entries.push({
        item,
        projectName: project.name,
        projectColor: project.color,
        score,
        blocks,
      });
    }
  }

  entries.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.item.updatedAt !== b.item.updatedAt) return b.item.updatedAt.localeCompare(a.item.updatedAt);
    return a.item.title.localeCompare(b.item.title);
  });

  return { entries, links, generatedAt: new Date().toISOString() };
}
