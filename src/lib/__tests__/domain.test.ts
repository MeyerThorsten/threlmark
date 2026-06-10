import { describe, expect, it } from "vitest";

import { summarizeInitiatives } from "@/lib/initiatives";
import { computeFlow } from "@/lib/metrics";
import { byPriorityDesc, priority } from "@/lib/priority";
import { normalizeItem, toCategory } from "@/lib/schema/normalize";
import { normalizeCategories, normalizeSavedViews } from "@/lib/projects/store";
import { CATEGORIES } from "@/lib/schema/types";
import { PROJECT_TEMPLATES, getTemplate } from "@/lib/templates";
import { NOW, daysAgo, doneItem, makeItem } from "./helpers";

describe("priority", () => {
  it("matches the roadmap.html formula", () => {
    // 4*3 + 3*2 + 4*2 - 3*1.5 = 21.5 → 22
    expect(priority({ impact: 4, evidence: 3, fit: 4, effort: 3 })).toBe(22);
    expect(priority({ impact: 5, evidence: 5, fit: 5, effort: 1 })).toBe(34);
    expect(priority({ impact: 1, evidence: 1, fit: 1, effort: 5 })).toBe(0); // floor at 0
  });

  it("sorts by priority, then recency, then title", () => {
    const a = makeItem({ impact: 5, title: "A" });
    const b = makeItem({ impact: 1, title: "B" });
    expect([b, a].sort(byPriorityDesc)[0].title).toBe("A");
  });
});

describe("toCategory (vertical-open)", () => {
  it("keeps default categories", () => {
    for (const c of CATEGORIES) expect(toCategory(c)).toBe(c);
  });
  it("preserves arbitrary vertical categories instead of coercing", () => {
    expect(toCategory("Campaigns")).toBe("Campaigns");
    expect(toCategory("  Audit ")).toBe("Audit");
  });
  it("caps absurdly long values and falls back on junk", () => {
    expect(toCategory("x".repeat(100))).toHaveLength(40);
    expect(toCategory("")).toBe("Build");
    expect(toCategory(null)).toBe("Build");
    expect(toCategory(42)).toBe("Build");
  });
});

describe("normalizeItem", () => {
  it("round-trips an external tool's category", () => {
    const item = normalizeItem(
      { title: "Q3 campaign", category: "Campaigns" },
      "proj",
      new Date(NOW).toISOString(),
    );
    expect(item.category).toBe("Campaigns");
    expect(item.status).toBe("idea");
    expect(item.transitions).toHaveLength(1);
  });
  it("preserves unknown keys", () => {
    const item = normalizeItem({ title: "t", customField: 7 }, "proj", daysAgo(0));
    expect(item.customField).toBe(7);
  });
});

describe("project normalizers", () => {
  it("normalizeCategories trims, dedupes and caps", () => {
    expect(normalizeCategories([" A ", "A", "B", ""])).toEqual(["A", "B"]);
    expect(normalizeCategories([])).toBeUndefined();
    expect(normalizeCategories("nope")).toBeUndefined();
    expect(normalizeCategories(Array.from({ length: 40 }, (_, i) => `c${i}`))).toHaveLength(24);
  });
  it("normalizeSavedViews keeps only named views with trimmed fields", () => {
    const views = normalizeSavedViews([
      { id: "v1", name: " Focus ", label: "vNext", search: " ", category: "" },
      { name: "" },
      "junk",
    ]);
    expect(views).toEqual([
      { id: "v1", name: "Focus", search: undefined, category: undefined, label: "vNext" },
    ]);
    expect(normalizeSavedViews([])).toBeUndefined();
  });
});

describe("templates", () => {
  it("every template has a unique id, name and 5+ categories", () => {
    const ids = new Set(PROJECT_TEMPLATES.map((t) => t.id));
    expect(ids.size).toBe(PROJECT_TEMPLATES.length);
    for (const t of PROJECT_TEMPLATES) {
      expect(t.name.length).toBeGreaterThan(2);
      expect(t.categories.length).toBeGreaterThanOrEqual(5);
      expect(new Set(t.categories).size).toBe(t.categories.length);
      for (const c of t.categories) expect(c.length).toBeLessThanOrEqual(40);
    }
  });
  it("getTemplate resolves by id and rejects junk", () => {
    expect(getTemplate("software")?.categories).toEqual([...CATEGORIES]);
    expect(getTemplate("nope")).toBeUndefined();
    expect(getTemplate(undefined)).toBeUndefined();
  });
});

describe("summarizeInitiatives", () => {
  it("rolls labels up with clamped progress", () => {
    const items = [
      makeItem({ labels: ["vNext"], status: "done" }),
      makeItem({ labels: ["vNext"] }),
      makeItem({ labels: ["vNext", "ux"] }),
    ];
    const [vnext, ux] = summarizeInitiatives(items);
    expect(vnext.label).toBe("vNext");
    expect(vnext.total).toBe(3);
    expect(vnext.done).toBe(1);
    expect(vnext.pctDone).toBe(33);
    expect(ux.total).toBe(1);
    expect(ux.pctDone).toBe(0);
  });
});

describe("computeFlow", () => {
  it("counts WIP, flags over-limit lanes and buckets throughput", () => {
    const items = [
      makeItem({ status: "development", createdAt: daysAgo(1) }),
      makeItem({ status: "development", createdAt: daysAgo(1) }),
      doneItem(3),
      doneItem(10),
    ];
    const flow = computeFlow(items, { now: NOW, wipLimits: { development: 1 } });
    expect(flow.wip.development).toBe(2);
    expect(flow.overLimit.development).toEqual({ count: 2, limit: 1 });
    expect(flow.throughput.reduce((a, b) => a + b.count, 0)).toBe(2);
    expect(flow.cycleTimeSamples).toBe(2);
    expect(flow.aging.length).toBe(2);
  });
});
