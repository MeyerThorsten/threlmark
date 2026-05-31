import Link from "next/link";
import { LinksManager, type ItemRef } from "@/components/links-manager";
import { PortfolioFlowStrip } from "@/components/portfolio-flow";
import { makeAddress } from "@/lib/ids";
import { listItemViews } from "@/lib/items/store";
import { portfolioFlow } from "@/lib/metrics";
import { buildPortfolio } from "@/lib/portfolio";
import { listProjects } from "@/lib/projects/store";
import { LANE_LABELS } from "@/lib/schema/types";

export const dynamic = "force-dynamic";

const MAX_ROWS = 40;

export default async function PortfolioPage() {
  const projects = await listProjects();

  if (projects.length === 0) {
    return (
      <>
        <div className="page-head">
          <div>
            <div className="page-kicker">Portfolio</div>
            <h1 className="page-title">All projects, one deck</h1>
          </div>
        </div>
        <div className="empty">
          <p>No projects yet — Threlmark is your central roadmap hub.</p>
          <Link href="/projects/new" className="btn btn-primary" style={{ marginTop: 12 }}>
            Create your first project
          </Link>
        </div>
      </>
    );
  }

  const [portfolio, flow] = await Promise.all([buildPortfolio(), portfolioFlow()]);
  const top = portfolio.entries.slice(0, MAX_ROWS);
  const maxScore = top[0]?.score || 1;

  // Build the link picker options (every item across every project).
  const itemRefs: ItemRef[] = [];
  for (const p of projects) {
    for (const item of await listItemViews(p.id)) {
      itemRefs.push({ address: makeAddress(p.id, item.id), label: `${p.name} · ${item.title}` });
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-kicker">Portfolio</div>
          <h1 className="page-title">Top of the deck</h1>
          <p className="page-desc">
            Every project&apos;s items ranked together by status-weighted priority, so what&apos;s
            actually in flight rises across the whole portfolio.
          </p>
        </div>
        <Link href="/projects/new" className="btn btn-primary">+ New project</Link>
      </div>

      <PortfolioFlowStrip flow={flow} />

      <div className="panel" style={{ overflow: "hidden", marginBottom: 22 }}>
        <table className="ptable">
          <thead>
            <tr>
              <th style={{ width: 36 }}>#</th>
              <th>Item</th>
              <th>Project</th>
              <th>Lane</th>
              <th style={{ width: 60, textAlign: "right" }}>Prio</th>
              <th style={{ width: 150 }}>Score</th>
            </tr>
          </thead>
          <tbody>
            {top.map((entry, i) => (
              <tr key={`${entry.item.projectId}/${entry.item.id}`}>
                <td className="rank-num">{i + 1}</td>
                <td>
                  <Link href={`/projects/${entry.item.projectId}`} style={{ color: "var(--text-strong)", fontWeight: 600 }}>
                    {entry.item.title}
                  </Link>
                  <div style={{ display: "flex", gap: 6, marginTop: 4, alignItems: "center" }}>
                    <span className="chip">{entry.item.category}</span>
                    {entry.item.source && <span className="chip chip-source">↩ {entry.item.source}</span>}
                    {entry.blocks > 0 && <span className="flag-block">⛔ blocks {entry.blocks}</span>}
                  </div>
                </td>
                <td>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                    <span className="dot" style={{ width: 9, height: 9, borderRadius: "50%", background: entry.projectColor || "var(--ember)" }} />
                    {entry.projectName}
                  </span>
                </td>
                <td className="muted" style={{ fontSize: 13 }}>{LANE_LABELS[entry.item.status]}</td>
                <td className="readout" style={{ textAlign: "right", color: "var(--ember)", fontWeight: 600 }}>
                  {entry.item.priority}
                </td>
                <td>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span className="score-bar"><span style={{ width: `${Math.max(6, (entry.score / maxScore) * 100)}%` }} /></span>
                    <span className="readout muted" style={{ fontSize: 11 }}>{entry.score}</span>
                  </div>
                </td>
              </tr>
            ))}
            {top.length === 0 && (
              <tr><td colSpan={6} className="muted" style={{ padding: 22 }}>No items yet. Import a roadmap or add cards in a project.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <LinksManager itemRefs={itemRefs} initialLinks={portfolio.links} />
    </>
  );
}
