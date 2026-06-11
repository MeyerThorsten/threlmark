/**
 * Agent report-back. Agents call POST .../report (preferred) or drop a JSON file
 * into projects/<id>/reports/ (fallback). A report appends to the item's
 * `reports[]`; a `done` report auto-moves the item to the Done lane. Dropped
 * files are ingested on read and filed under reports/.applied.
 */

import { readdir, rename, rm } from "node:fs/promises";

import { emitEvent, eventItem } from "../events";
import { ensureDir, pathExists, readJson } from "../fsops";
import { readItem, listItems } from "../items/io";
import { moveLane, updateItem } from "../items/store";
import { withPriority } from "../priority";
import { appliedReportsDir, reportsDir, reportPath } from "../paths";
import { toReportStatus } from "../schema/normalize";
import {
  AGENTS,
  type Agent,
  type AgentReport,
  type RoadmapItemView,
} from "../schema/types";

function toAgent(value: unknown): Agent {
  return AGENTS.includes(value as Agent) ? (value as Agent) : "other";
}

export interface ReportInput {
  agent: string;
  status: string;
  summary?: string;
  verification?: string;
  at?: string;
}

/** Record one report on an item; a `done` report moves it to the Done lane. */
export async function recordReport(
  projectId: string,
  itemId: string,
  input: ReportInput,
): Promise<RoadmapItemView | null> {
  const current = await readItem(projectId, itemId);
  if (!current) return null;
  const report: AgentReport = {
    at: input.at && typeof input.at === "string" ? input.at : new Date().toISOString(),
    agent: toAgent(input.agent),
    status: toReportStatus(input.status),
    summary: typeof input.summary === "string" ? input.summary : "",
    verification: typeof input.verification === "string" ? input.verification : undefined,
  };
  const patch: Parameters<typeof updateItem>[2] = {
    reports: [...(current.reports ?? []), report],
  };
  // A `done` report records what was built into `outcome` (unless already set).
  if (report.status === "done" && report.summary.trim() && !current.outcome) {
    patch.outcome = report.summary.trim();
  }
  await updateItem(projectId, itemId, patch);
  await emitEvent({
    type: "report.received",
    at: report.at,
    projectId,
    itemId,
    item: eventItem(current),
    data: { agent: report.agent, reportStatus: report.status, summary: report.summary },
  });
  if (report.status === "done" && current.status !== "done") {
    return moveLane(projectId, itemId, "done");
  }
  const updated = await readItem(projectId, itemId);
  return updated ? withPriority(updated) : null;
}

/** A recent report enriched with the item's title for display/toasts. */
export interface ReportView extends AgentReport {
  itemId: string;
  title: string;
  itemStatus: string;
}

/**
 * Ingest any dropped report files (the file fallback), applying each and moving
 * the file to reports/.applied. Safe to call on every read.
 */
export async function ingestReports(projectId: string): Promise<number> {
  const dir = reportsDir(projectId);
  if (!(await pathExists(dir))) return 0;
  const entries = await readdir(dir, { withFileTypes: true });
  let applied = 0;
  for (const e of entries) {
    if (!e.isFile() || !e.name.endsWith(".json")) continue;
    const raw = await readJson<Record<string, unknown>>(reportPath(projectId, e.name));
    const itemId = raw && typeof raw.itemId === "string" ? raw.itemId : null;
    if (raw && itemId) {
      await recordReport(projectId, itemId, {
        agent: String(raw.agent ?? "other"),
        status: String(raw.status ?? "started"),
        summary: typeof raw.summary === "string" ? raw.summary : "",
        verification: typeof raw.verification === "string" ? raw.verification : undefined,
        at: typeof raw.at === "string" ? raw.at : undefined,
      });
      applied++;
    }
    await ensureDir(appliedReportsDir(projectId));
    await rename(reportPath(projectId, e.name), `${appliedReportsDir(projectId)}/${e.name}`).catch(
      async () => {
        await rm(reportPath(projectId, e.name), { force: true });
      },
    );
  }
  return applied;
}

/** All reports across a project's items, most recent first. */
export async function listRecentReports(
  projectId: string,
  limit = 30,
): Promise<ReportView[]> {
  const items = await listItems(projectId);
  const out: ReportView[] = [];
  for (const it of items) {
    for (const r of it.reports ?? []) {
      out.push({ ...r, itemId: it.id, title: it.title, itemStatus: it.status });
    }
  }
  return out.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}
