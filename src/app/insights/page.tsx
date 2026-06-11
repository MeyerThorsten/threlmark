import Link from "next/link";
import {
  ForecastCard,
  OutcomeLedger,
  RiskRegister,
} from "@/components/insights-panel";
import { portfolioInsights } from "@/lib/insights";

export const dynamic = "force-dynamic";

export default async function PortfolioInsightsPage() {
  const insights = await portfolioInsights();
  const initiatives = insights.initiatives.filter((i) => i.total >= 2).slice(0, 14);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-kicker">Portfolio intelligence</div>
          <h1 className="page-title">Insights</h1>
          <p className="page-desc">
            One honest view across {insights.projectCount} projects: every derived risk signal,
            the portfolio-level forecast, cross-project initiatives, and what recently shipped.
          </p>
        </div>
      </div>

      <div style={{ display: "grid", gap: 16 }}>
        <ForecastCard result={insights.forecast} scope="all projects combined" />
        <RiskRegister risks={insights.risks} showProject />

        <div className="panel" style={{ padding: 18 }}>
          <h3 style={{ fontSize: 15, marginBottom: 4 }}>Initiatives across projects</h3>
          <p className="muted" style={{ fontSize: 12.5, marginTop: 0, marginBottom: 12 }}>
            Labels rolled up portfolio-wide — progress per theme, wherever the work lives
          </p>
          {initiatives.length === 0 ? (
            <p className="muted" style={{ fontSize: 13 }}>
              No multi-item labels yet. Tag cards with a shared label to track a theme here.
            </p>
          ) : (
            <table className="ptable">
              <thead>
                <tr>
                  <th>Initiative</th>
                  <th>Progress</th>
                  <th style={{ width: "32%" }}></th>
                  <th>Open</th>
                  <th>Projects</th>
                </tr>
              </thead>
              <tbody>
                {initiatives.map((init) => (
                  <tr key={init.label}>
                    <td style={{ fontWeight: 600, color: "var(--text-strong)" }}>{init.label}</td>
                    <td className="readout" style={{ whiteSpace: "nowrap" }}>
                      {init.done}/{init.total} · {init.pctDone}%
                    </td>
                    <td>
                      <span className="score-bar" aria-hidden="true">
                        <span style={{ width: `${init.pctDone}%` }} />
                      </span>
                    </td>
                    <td className="readout">{init.open}</td>
                    <td className="muted" style={{ fontSize: 12 }}>{init.projects.join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <OutcomeLedger outcomes={insights.outcomes} showProject limit={16} />

        <div className="panel" style={{ padding: 18 }}>
          <h3 style={{ fontSize: 15, marginBottom: 4 }}>Week in review</h3>
          <p className="muted" style={{ fontSize: 12.5, marginTop: 0, marginBottom: 12 }}>
            Shipped, started, new items, risks and forecast for the last 7 days — generated on demand from item history.
          </p>
          <div className="toolbar">
            <a className="btn btn-sm" href="/api/digest?format=html" target="_blank" rel="noopener">Open digest</a>
            <a className="btn btn-sm" href="/api/digest?format=md" target="_blank" rel="noopener">Markdown</a>
            <a className="btn btn-sm" href="/api/digest?format=html&days=30" target="_blank" rel="noopener">Last 30 days</a>
            <span className="muted" style={{ fontSize: 12, alignSelf: "center" }}>
              <code style={{ fontFamily: "var(--font-mono)" }}>/api/digest?save=1</code> drops dated md+html into <code style={{ fontFamily: "var(--font-mono)" }}>~/.threlmark/digests/</code>
            </span>
          </div>
        </div>

        <p className="muted" style={{ fontSize: 12 }}>
          Also available per project — open any project and use its <b>Insights</b> tab.
          Agent-readable at <code style={{ fontFamily: "var(--font-mono)" }}>/api/insights</code>.{" "}
          <Link href="/">Back to portfolio →</Link>
        </p>
      </div>
    </>
  );
}
