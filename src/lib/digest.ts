/**
 * Weekly review digest — "what happened, what's at risk, when will it land",
 * rendered as markdown and self-contained HTML. Movement (shipped / started /
 * created) is reconstructed from item `transitions`, so the digest needs no
 * extra bookkeeping and can be generated for any window after the fact.
 * `?save=1` drops dated files into `<root>/digests/` for a cron habit.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { lastEnteredLaneAt } from "./flow";
import {
  assessRisks,
  forecastCompletion,
  type ForecastResult,
  type RiskSignal,
} from "./insights";
import { summarizeInitiatives } from "./initiatives";
import { listItemViews } from "./items/store";
import { listLinks } from "./links/store";
import { dataRoot } from "./paths";
import { listProjects } from "./projects/store";
import type { RoadmapItemView } from "./schema/types";

const DAY_MS = 24 * 3600 * 1000;

export interface DigestMove {
  projectId: string;
  projectName: string;
  itemId: string;
  title: string;
  category: string;
  at: string;
  agent?: string;
  outcome?: string;
}

export interface Digest {
  days: number;
  since: string;
  generatedAt: string;
  projectCount: number;
  shipped: DigestMove[];
  started: DigestMove[];
  created: DigestMove[];
  risks: RiskSignal[];
  forecast: ForecastResult;
  initiatives: { label: string; done: number; total: number; pctDone: number }[];
}

function inWindow(at: string | null, sinceMs: number): at is string {
  return !!at && Date.parse(at) >= sinceMs;
}

export async function buildDigest(days = 7): Promise<Digest> {
  const now = Date.now();
  const sinceMs = now - days * DAY_MS;
  const since = new Date(sinceMs).toISOString();
  const [projects, links] = await Promise.all([listProjects(), listLinks()]);

  const shipped: DigestMove[] = [];
  const started: DigestMove[] = [];
  const created: DigestMove[] = [];
  const risks: RiskSignal[] = [];
  const allItems: RoadmapItemView[] = [];

  const perProject = await Promise.all(
    projects.map(async (p) => ({ project: p, items: await listItemViews(p.id) })),
  );

  for (const { project, items } of perProject) {
    allItems.push(...items);
    risks.push(
      ...assessRisks(items, {
        wipLimits: project.wipLimits,
        links,
        projectId: project.id,
        projectName: project.name,
        now,
      }),
    );
    for (const it of items) {
      const base = {
        projectId: project.id,
        projectName: project.name,
        itemId: it.id,
        title: it.title,
        category: it.category,
      };
      const doneAt = it.status === "done" ? lastEnteredLaneAt(it, "done") : null;
      if (inWindow(doneAt, sinceMs)) {
        shipped.push({ ...base, at: doneAt, agent: it.handoff?.agent, outcome: it.outcome });
      }
      const devAt = lastEnteredLaneAt(it, "development");
      if (it.status === "development" && inWindow(devAt, sinceMs)) {
        started.push({ ...base, at: devAt });
      }
      if (inWindow(it.createdAt, sinceMs)) {
        created.push({ ...base, at: it.createdAt });
      }
    }
  }

  const bySeverity = { high: 0, medium: 1, low: 2 } as const;
  shipped.sort((a, b) => b.at.localeCompare(a.at));
  started.sort((a, b) => b.at.localeCompare(a.at));
  created.sort((a, b) => b.at.localeCompare(a.at));
  risks.sort((a, b) => bySeverity[a.severity] - bySeverity[b.severity]);

  return {
    days,
    since,
    generatedAt: new Date(now).toISOString(),
    projectCount: projects.length,
    shipped,
    started,
    created,
    risks,
    forecast: forecastCompletion(allItems, { now }),
    initiatives: summarizeInitiatives(allItems)
      .filter((i) => i.total >= 2 && i.open > 0)
      .slice(0, 10)
      .map(({ label, done, total, pctDone }) => ({ label, done, total, pctDone })),
  };
}

function moveLine(m: DigestMove): string {
  const agent = m.agent ? ` · ⇥ ${m.agent}` : "";
  return `- **${m.title}** — ${m.projectName} · ${m.category}${agent} (${m.at.slice(0, 10)})`;
}

export function digestMarkdown(d: Digest): string {
  const f = d.forecast.forecast;
  const lines = [
    `# Threlmark week in review — ${d.generatedAt.slice(0, 10)}`,
    "",
    `Window: last ${d.days} days (since ${d.since.slice(0, 10)}) · ${d.projectCount} projects`,
    "",
    `## Shipped (${d.shipped.length})`,
    ...(d.shipped.length ? d.shipped.map((m) => moveLine(m) + (m.outcome ? `\n  - outcome: ${m.outcome}` : "")) : ["- nothing shipped this window"]),
    "",
    `## Started (${d.started.length})`,
    ...(d.started.length ? d.started.map(moveLine) : ["- nothing newly in development"]),
    "",
    `## New items (${d.created.length})`,
    ...(d.created.length ? d.created.map(moveLine) : ["- none"]),
    "",
    `## Risks now (${d.risks.length})`,
    ...(d.risks.length
      ? d.risks.slice(0, 12).map((r) => `- **${r.severity.toUpperCase()}** ${r.title}${r.projectName ? ` — ${r.projectName}` : ""}`)
      : ["- none — clean board"]),
    "",
    "## Forecast",
    f
      ? `- ${f.remaining} open ranked+development items · likely done ${f.p50Date} (P50), conservatively ${f.p85Date} (P85) at ~${f.avgPerWeek}/week`
      : `- ${d.forecast.reason}`,
    "",
    `## Open initiatives`,
    ...(d.initiatives.length
      ? d.initiatives.map((i) => `- ${i.label}: ${i.done}/${i.total} (${i.pctDone}%)`)
      : ["- none in flight"]),
    "",
  ];
  return lines.join("\n");
}

export function digestHtml(d: Digest): string {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const f = d.forecast.forecast;
  const sevColor = { high: "#be123c", medium: "#b45309", low: "#667085" } as const;
  const moveRow = (m: DigestMove) =>
    `<li><b>${esc(m.title)}</b> <span class="mut">— ${esc(m.projectName)} · ${esc(m.category)}${m.agent ? ` · ⇥ ${esc(m.agent)}` : ""} · ${m.at.slice(0, 10)}</span>${m.outcome ? `<div class="mut out">${esc(m.outcome)}</div>` : ""}</li>`;
  const section = (title: string, body: string) =>
    `<section><h2>${title}</h2>${body}</section>`;
  const list = (moves: DigestMove[], empty: string) =>
    moves.length ? `<ul>${moves.map(moveRow).join("")}</ul>` : `<p class="mut">${empty}</p>`;

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/>
<title>Threlmark week in review — ${d.generatedAt.slice(0, 10)}</title>
<style>
body{font-family:Inter,system-ui,sans-serif;max-width:760px;margin:0 auto;padding:40px 22px;color:#16181d;background:#f4f6f8;line-height:1.55}
h1{font-size:26px;letter-spacing:-.01em}h2{font-size:16px;margin:28px 0 8px}
.k{font-family:ui-monospace,Menlo,monospace;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#4f46e5;font-weight:700}
.mut{color:#667085;font-size:13px}.out{margin:2px 0 0 2px;font-size:12.5px}
ul{padding-left:18px;margin:6px 0}li{margin:7px 0;font-size:14px}
.sev{font-family:ui-monospace,monospace;font-size:10.5px;font-weight:700;text-transform:uppercase}
section{background:#fff;border:1px solid #d9dee7;border-radius:14px;padding:16px 20px;margin:14px 0}
</style></head><body>
<div class="k">Threlmark · week in review</div>
<h1>${d.generatedAt.slice(0, 10)}</h1>
<p class="mut">Last ${d.days} days (since ${d.since.slice(0, 10)}) · ${d.projectCount} projects · generated ${d.generatedAt.slice(0, 16).replace("T", " ")}</p>
${section(`Shipped (${d.shipped.length})`, list(d.shipped, "Nothing shipped this window."))}
${section(`Started (${d.started.length})`, list(d.started, "Nothing newly in development."))}
${section(`New items (${d.created.length})`, list(d.created, "None."))}
${section(
    `Risks now (${d.risks.length})`,
    d.risks.length
      ? `<ul>${d.risks
          .slice(0, 12)
          .map(
            (r) =>
              `<li><span class="sev" style="color:${sevColor[r.severity]}">${r.severity}</span> ${esc(r.title)}${r.projectName ? ` <span class="mut">— ${esc(r.projectName)}</span>` : ""}</li>`,
          )
          .join("")}</ul>`
      : `<p class="mut">None — clean board.</p>`,
  )}
${section(
    "Forecast",
    f
      ? `<p>${f.remaining} open ranked+development items · likely done <b>${f.p50Date}</b> (P50), conservatively <b>${f.p85Date}</b> (P85) at ~${f.avgPerWeek}/week.</p>`
      : `<p class="mut">${esc(d.forecast.reason ?? "")}</p>`,
  )}
${section(
    "Open initiatives",
    d.initiatives.length
      ? `<ul>${d.initiatives.map((i) => `<li>${esc(i.label)}: ${i.done}/${i.total} (${i.pctDone}%)</li>`).join("")}</ul>`
      : `<p class="mut">None in flight.</p>`,
  )}
<p class="mut">Generated by Threlmark · local-first · plain JSON on disk</p>
</body></html>`;
}

export const digestsDir = () => join(dataRoot(), "digests");

/** Write dated md + html files into <root>/digests/; returns the paths. */
export async function saveDigest(d: Digest): Promise<{ md: string; html: string }> {
  await mkdir(digestsDir(), { recursive: true });
  const stamp = d.generatedAt.slice(0, 10);
  const md = join(digestsDir(), `digest-${stamp}.md`);
  const html = join(digestsDir(), `digest-${stamp}.html`);
  await writeFile(md, digestMarkdown(d), "utf8");
  await writeFile(html, digestHtml(d), "utf8");
  return { md, html };
}
