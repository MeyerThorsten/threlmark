import { describe, expect, it } from "vitest";

import { digestHtml, digestMarkdown, type Digest } from "@/lib/digest";
import {
  applyRules,
  deliverWebhooks,
  webhookMatches,
  type ThrelmarkEvent,
} from "@/lib/events";
import { blockCounts, planMarkdown, scorePlanEntry, PLAN_BOOSTS } from "@/lib/plan";
import { excerpt, matchScore } from "@/lib/search";
import { renderSnapshotHtml } from "@/lib/snapshot";
import type { Link, Project } from "@/lib/schema/types";
import { NOW, daysAgo, doneItem, makeItem } from "./helpers";

const event = (over: Partial<ThrelmarkEvent> = {}): ThrelmarkEvent => ({
  type: "item.moved",
  at: daysAgo(0),
  projectId: "proj",
  itemId: "it-1",
  item: { id: "it-1", title: "T", status: "development", category: "Build", labels: ["x"] },
  ...over,
});

describe("events: rules & webhooks", () => {
  it("matches rules on event type, lane, label and project", () => {
    expect(applyRules([{ on: "item.moved", toLane: "development", addLabels: ["wip"] }], event()))
      .toEqual(["wip"]);
    expect(applyRules([{ on: "item.done", addLabels: ["wip"] }], event())).toEqual([]);
    expect(applyRules([{ on: "*", ifLabel: "x", addLabels: ["seen"] }], event())).toEqual(["seen"]);
    expect(applyRules([{ on: "*", ifLabel: "nope", addLabels: ["seen"] }], event())).toEqual([]);
    expect(applyRules([{ on: "*", projectId: "other", addLabels: ["a"] }], event())).toEqual([]);
  });

  it("never re-adds labels the item already has", () => {
    expect(applyRules([{ on: "*", addLabels: ["x", "new"] }], event())).toEqual(["new"]);
  });

  it("webhookMatches honours subscriptions and wildcards", () => {
    expect(webhookMatches({ url: "u" }, "item.done")).toBe(true);
    expect(webhookMatches({ url: "u", events: ["*"] }, "item.done")).toBe(true);
    expect(webhookMatches({ url: "u", events: ["item.done"] }, "item.moved")).toBe(false);
  });

  it("deliverWebhooks posts the event and survives failures", async () => {
    const calls: { url: string; body: ThrelmarkEvent }[] = [];
    const fetchImpl = async (url: string, init: RequestInit) => {
      if (url.includes("boom")) throw new Error("connection refused");
      calls.push({ url, body: JSON.parse(init.body as string) });
      return { status: 200 };
    };
    await expect(
      deliverWebhooks(
        [
          { url: "http://ok.test/hook", events: ["item.moved"] },
          { url: "http://boom.test/hook" },
          { url: "http://skip.test", events: ["item.done"] },
        ],
        event(),
        fetchImpl,
      ),
    ).resolves.toBeUndefined();
    expect(calls).toHaveLength(1);
    expect(calls[0].body.type).toBe("item.moved");
  });
});

describe("plan: risk-aware scoring", () => {
  it("boosts overdue items above equal-priority quiet ones", () => {
    const quiet = makeItem({ status: "ranked", createdAt: daysAgo(1) });
    const overdue = makeItem({ status: "ranked", createdAt: daysAgo(1), dueDate: "2026-06-01" });
    const a = scorePlanEntry(quiet, { now: NOW });
    const b = scorePlanEntry(overdue, { now: NOW });
    expect(b.score).toBeCloseTo(a.score + PLAN_BOOSTS.overdue, 5);
    expect(b.reasons.join()).toContain("overdue");
  });

  it("boosts blockers per blocked item and explains it", () => {
    const it1 = makeItem({ status: "ranked", createdAt: daysAgo(1) });
    const { score, reasons } = scorePlanEntry(it1, { blocks: 2, now: NOW });
    expect(score).toBeCloseTo(scorePlanEntry(it1, { now: NOW }).score + 2 * PLAN_BOOSTS.blocksEach, 5);
    expect(reasons.join()).toContain("blocks 2");
  });

  it("flags stale development and stalled handoffs", () => {
    const stale = makeItem({ status: "development", createdAt: daysAgo(10) });
    expect(scorePlanEntry(stale, { now: NOW }).reasons.join()).toContain("stale");
    const stalled = makeItem({
      status: "development",
      createdAt: daysAgo(9),
      handoff: { handoffId: "h", agent: "claude", at: daysAgo(9) },
    });
    expect(scorePlanEntry(stalled, { now: NOW }).reasons.join()).toContain("stalled");
  });

  it("blockCounts counts only blocks-links", () => {
    const links: Link[] = [
      { id: "1", from: "p/a", to: "p/b", kind: "blocks", createdAt: daysAgo(1) },
      { id: "2", from: "p/a", to: "p/c", kind: "blocks", createdAt: daysAgo(1) },
      { id: "3", from: "p/a", to: "p/d", kind: "relates", createdAt: daysAgo(1) },
    ];
    expect(blockCounts(links).get("p/a")).toBe(2);
  });

  it("planMarkdown renders a checklist with reasons", () => {
    const item = makeItem({ title: "Fix the thing", status: "development", createdAt: daysAgo(1) });
    const md = planMarkdown({
      entries: [{ item, projectId: "p", projectName: "Proj", score: 30, reasons: ["already in development — finishing beats starting"] }],
      totalOpen: 5,
      generatedAt: daysAgo(0),
    });
    expect(md).toContain("- [ ] **1. Fix the thing** — Proj · Development · score 30");
    expect(md).toContain("finishing beats starting");
  });
});

describe("search: ranking & excerpts", () => {
  it("ranks title prefix > title > label > category > body", () => {
    const scores = [
      matchScore("camp", { title: "Campaign launch" }),
      matchScore("camp", { title: "Launch campaign" }),
      matchScore("camp", { title: "x", labels: ["campaigns"] }),
      matchScore("camp", { title: "x", category: "Campaigns" }),
      matchScore("camp", { title: "x", body: "about the campaign" }),
      matchScore("camp", { title: "x" }),
    ];
    expect(scores).toEqual([100, 80, 60, 50, 30, 0]);
  });

  it("excerpt centers on the first hit", () => {
    const body = "a".repeat(100) + " the needle sits here " + "b".repeat(100);
    const ex = excerpt(body, "needle")!;
    expect(ex).toContain("needle");
    expect(ex.startsWith("…")).toBe(true);
    expect(ex.endsWith("…")).toBe(true);
    expect(excerpt("no hit here", "needle")).toBeUndefined();
  });
});

describe("snapshot & digest rendering", () => {
  const project = { id: "p", name: "Acme Plan", description: "All the work", color: "#123456" } as Project;

  it("snapshot html is self-contained and complete", () => {
    const items = [
      makeItem({ title: "Ship <thing>", status: "development", labels: ["vNext"], createdAt: daysAgo(1) }),
      makeItem({ title: "Idea one", status: "idea", createdAt: daysAgo(1), labels: ["vNext"] }),
      doneItem(2, 2, { title: "Old win" }),
    ];
    const html = renderSnapshotHtml(project, items, daysAgo(0));
    expect(html).toContain("Acme Plan");
    expect(html).toContain("Ship &lt;thing&gt;"); // escaped
    expect(html).toContain("Old win");
    expect(html).toContain("vNext");
    expect(html).not.toContain("<script"); // no scripts, safe to share
    expect(html).not.toMatch(/src=|href=/); // no external requests
  });

  const digest: Digest = {
    days: 7,
    since: daysAgo(7),
    generatedAt: daysAgo(0),
    projectCount: 2,
    shipped: [{ projectId: "p", projectName: "Acme", itemId: "i", title: "Shipped it", category: "Build", at: daysAgo(1), agent: "claude", outcome: "It works" }],
    started: [{ projectId: "p", projectName: "Acme", itemId: "j", title: "Started it", category: "Build", at: daysAgo(2) }],
    created: [],
    risks: [{ kind: "overdue", severity: "high", title: "Overdue: x", detail: "", action: "", projectName: "Acme", itemIds: [] }],
    forecast: { forecast: null, reason: "Not enough throughput history" },
    initiatives: [{ label: "vNext", done: 1, total: 3, pctDone: 33 }],
  };

  it("digest markdown covers all sections", () => {
    const md = digestMarkdown(digest);
    for (const expected of ["## Shipped (1)", "Shipped it", "outcome: It works", "## Started (1)", "## Risks now (1)", "Overdue: x", "Not enough throughput history", "vNext: 1/3 (33%)"]) {
      expect(md).toContain(expected);
    }
  });

  it("digest html is self-contained and escaped", () => {
    const html = digestHtml({ ...digest, shipped: [{ ...digest.shipped[0], title: "a<b>" }] });
    expect(html).toContain("a&lt;b&gt;");
    expect(html).toContain("week in review");
    expect(html).not.toContain("<script");
  });
});
