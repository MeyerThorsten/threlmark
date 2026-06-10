import { describe, expect, it } from "vitest";

import {
  assessRisks,
  forecastCompletion,
  mulberry32,
  type RiskKind,
} from "@/lib/insights";
import type { Link } from "@/lib/schema/types";
import { NOW, daysAgo, doneItem, makeItem } from "./helpers";

const kinds = (risks: { kind: RiskKind }[]) => risks.map((r) => r.kind);

describe("assessRisks", () => {
  it("returns no risks for a quiet healthy board", () => {
    const items = [
      makeItem({ status: "idea", createdAt: daysAgo(2) }),
      makeItem({ status: "ranked", createdAt: daysAgo(3) }),
      doneItem(2),
    ];
    expect(assessRisks(items, { now: NOW })).toEqual([]);
  });

  it("flags overdue items as high severity", () => {
    const risks = assessRisks(
      [makeItem({ status: "ranked", dueDate: "2026-06-01", title: "Late thing" })],
      { now: NOW },
    );
    expect(kinds(risks)).toContain("overdue");
    const overdue = risks.find((r) => r.kind === "overdue")!;
    expect(overdue.severity).toBe("high");
    expect(overdue.title).toContain("Late thing");
    expect(overdue.detail).toContain("2026-06-01");
  });

  it("flags items due within 3 days, harsher when not started", () => {
    const due = new Date(NOW + 2 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const ranked = assessRisks([makeItem({ status: "ranked", dueDate: due })], { now: NOW });
    const dev = assessRisks([makeItem({ status: "development", dueDate: due })], { now: NOW });
    expect(ranked.find((r) => r.kind === "due-soon")?.severity).toBe("high");
    expect(dev.find((r) => r.kind === "due-soon")?.severity).toBe("medium");
  });

  it("flags stale development work as high, stale ideas as low", () => {
    const risks = assessRisks(
      [
        makeItem({ status: "development", createdAt: daysAgo(10) }), // >7d threshold
        makeItem({ status: "idea", createdAt: daysAgo(90) }), // >60d threshold
      ],
      { now: NOW },
    );
    const stale = risks.filter((r) => r.kind === "stale-development");
    expect(stale.map((r) => r.severity).sort()).toEqual(["high", "low"]);
  });

  it("flags lanes over their WIP limit", () => {
    const items = [1, 2, 3, 4].map(() =>
      makeItem({ status: "development", createdAt: daysAgo(1) }),
    );
    const risks = assessRisks(items, { now: NOW, wipLimits: { development: 3 } });
    const over = risks.find((r) => r.kind === "wip-over-limit")!;
    expect(over.severity).toBe("high");
    expect(over.itemIds).toHaveLength(4);
  });

  it("flags handed-off items stalled past the threshold", () => {
    const item = makeItem({
      status: "development",
      createdAt: daysAgo(9),
      handoff: { handoffId: "h1", agent: "claude", at: daysAgo(9) },
    });
    const risks = assessRisks([item], { now: NOW });
    expect(kinds(risks)).toContain("stalled-handoff");
  });

  it("flags open items that block others, high when blocking 2+", () => {
    const blocker = makeItem({ status: "ranked", createdAt: daysAgo(1), id: "blk" });
    const links: Link[] = [
      { id: "l1", from: "proj/blk", to: "proj/a", kind: "blocks", createdAt: daysAgo(1) },
      { id: "l2", from: "proj/blk", to: "other/b", kind: "blocks", createdAt: daysAgo(1) },
    ];
    const risks = assessRisks([blocker], { now: NOW, links, projectId: "proj" });
    const b = risks.find((r) => r.kind === "bottleneck")!;
    expect(b.severity).toBe("high");
    expect(b.itemIds).toEqual(["blk"]);
  });

  it("flags an idea pile-up", () => {
    const items = Array.from({ length: 16 }, () =>
      makeItem({ status: "idea", createdAt: daysAgo(1) }),
    );
    expect(kinds(assessRisks(items, { now: NOW }))).toContain("idea-pileup");
  });

  it("flags a throughput stall when dev work exists but nothing shipped in 3 weeks", () => {
    const items = [
      makeItem({ status: "development", createdAt: daysAgo(2) }),
      doneItem(30),
    ];
    expect(kinds(assessRisks(items, { now: NOW }))).toContain("throughput-stall");
    // …but not when something shipped recently
    const fresh = [makeItem({ status: "development", createdAt: daysAgo(2) }), doneItem(3)];
    expect(kinds(assessRisks(fresh, { now: NOW }))).not.toContain("throughput-stall");
  });

  it("sorts high severity first", () => {
    const items = [
      makeItem({ status: "idea", createdAt: daysAgo(90) }), // low
      makeItem({ status: "ranked", dueDate: "2026-06-01" }), // high
    ];
    const risks = assessRisks(items, { now: NOW });
    expect(risks[0].severity).toBe("high");
    expect(risks[risks.length - 1].severity).toBe("low");
  });
});

describe("forecastCompletion", () => {
  it("refuses to forecast an empty backlog", () => {
    const r = forecastCompletion([doneItem(2)], { now: NOW });
    expect(r.forecast).toBeNull();
    expect(r.reason).toMatch(/Nothing in Ranked/);
  });

  it("refuses to forecast on thin throughput history", () => {
    const r = forecastCompletion(
      [makeItem({ status: "ranked" }), doneItem(3)],
      { now: NOW },
    );
    expect(r.forecast).toBeNull();
    expect(r.reason).toMatch(/Not enough throughput history/);
  });

  it("forecasts from real weekly throughput, deterministically", () => {
    const items = [
      // 4 weeks of history: one item finished per week
      doneItem(7), doneItem(14), doneItem(21), doneItem(28),
      ...Array.from({ length: 4 }, () => makeItem({ status: "ranked" })),
    ];
    const a = forecastCompletion(items, { now: NOW, rng: mulberry32(42) });
    const b = forecastCompletion(items, { now: NOW, rng: mulberry32(42) });
    expect(a.forecast).not.toBeNull();
    expect(a).toEqual(b); // deterministic given the same seed
    const f = a.forecast!;
    expect(f.remaining).toBe(4);
    expect(f.p85Weeks).toBeGreaterThanOrEqual(f.p50Weeks);
    // 4 items at ≤1/week can't finish faster than 4 weeks
    expect(f.p50Weeks).toBeGreaterThanOrEqual(4);
    expect(f.p50Date > "2026-06-10").toBe(true);
  });

  it("excludes the current partial week from the sampled history", () => {
    const items = [
      doneItem(0), // this week — must not count
      doneItem(7), doneItem(14),
      makeItem({ status: "ranked" }),
    ];
    const r = forecastCompletion(items, { now: NOW });
    const total = r.forecast!.weeklyRates.reduce((x, y) => x + y, 0);
    expect(total).toBe(2);
  });
});
