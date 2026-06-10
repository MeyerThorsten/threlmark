/**
 * Store integration tests over a throwaway THRELMARK_DATA_DIR. Locks in that
 * the parallelized read paths (listItems / listProjects / portfolio-wide
 * aggregations) return complete, deterministically-ordered results.
 */

import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let root: string;

async function seedProject(id: string, name: string, itemTitles: string[]) {
  const dir = join(root, "projects", id);
  await mkdir(join(dir, "items"), { recursive: true });
  const now = "2026-06-01T00:00:00.000Z";
  await writeFile(
    join(dir, "project.json"),
    JSON.stringify({ schemaVersion: 2, id, name, slug: id, status: "active", createdAt: now, updatedAt: now }),
  );
  for (const [i, title] of itemTitles.entries()) {
    const itemId = `${id}-item-${i}`;
    await writeFile(
      join(dir, "items", `${itemId}.json`),
      JSON.stringify({
        schemaVersion: 2, id: itemId, projectId: id, title,
        category: "Build", status: i === 0 ? "done" : "ranked",
        impact: 4, evidence: 3, fit: 4, effort: 3,
        description: "", files: "", acceptance: [],
        transitions: [{ to: i === 0 ? "done" : "ranked", at: now }],
        createdAt: now, updatedAt: now,
      }),
    );
  }
}

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "threlmark-test-"));
  process.env.THRELMARK_DATA_DIR = root;
  await seedProject("alpha", "Alpha", ["A done", "A ranked 1", "A ranked 2"]);
  await seedProject("beta", "Beta", ["B done", "B ranked 1"]);
});

afterAll(async () => {
  delete process.env.THRELMARK_DATA_DIR;
  await rm(root, { recursive: true, force: true });
});

describe("parallel store reads", () => {
  it("listItems returns every item", async () => {
    const { listItems } = await import("@/lib/items/io");
    const items = await listItems("alpha");
    expect(items.map((i) => i.title).sort()).toEqual(["A done", "A ranked 1", "A ranked 2"]);
  });

  it("listProjects returns all projects name-sorted", async () => {
    const { listProjects } = await import("@/lib/projects/store");
    const projects = await listProjects();
    expect(projects.map((p) => p.name)).toEqual(["Alpha", "Beta"]);
  });

  it("buildPortfolio covers all items and is deterministic", async () => {
    const { buildPortfolio } = await import("@/lib/portfolio");
    const a = await buildPortfolio();
    const b = await buildPortfolio();
    expect(a.entries).toHaveLength(5);
    expect(a.entries.map((e) => e.item.id)).toEqual(b.entries.map((e) => e.item.id));
  });

  it("portfolioFlow aggregates across projects", async () => {
    const { portfolioFlow } = await import("@/lib/metrics");
    const flow = await portfolioFlow();
    expect(flow.projectCount).toBe(2);
    expect(flow.wip.ranked).toBe(3);
    expect(flow.wip.done).toBe(2);
  });

  it("portfolioInsights merges per-project results deterministically", async () => {
    const { portfolioInsights } = await import("@/lib/insights");
    const a = await portfolioInsights();
    const b = await portfolioInsights();
    expect(a.projectCount).toBe(2);
    expect(a.forecast.forecast).toBeNull(); // thin history → honest null
    expect(a.risks.map((r) => r.title)).toEqual(b.risks.map((r) => r.title));
    expect(a.outcomes).toEqual(b.outcomes);
  });
});
