/**
 * Decision-intelligence surfaces: risk register, throughput forecast, decision
 * log and outcome ledger. Pure display over `ProjectInsights`/`PortfolioInsights`
 * — server-rendered, no client state.
 */

import Link from "next/link";

import type {
  DecisionEntry,
  ForecastResult,
  OutcomeEntry,
  ProjectInsights,
  RiskSignal,
} from "@/lib/insights";

function fmt(at: string | null): string {
  if (!at) return "";
  const d = new Date(at);
  return Number.isNaN(d.getTime())
    ? at
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function SeverityBadge({ severity }: { severity: RiskSignal["severity"] }) {
  return <span className={`sev sev-${severity}`}>{severity}</span>;
}

export function RiskRegister({
  risks,
  showProject = false,
  limit = 30,
}: {
  risks: RiskSignal[];
  showProject?: boolean;
  limit?: number;
}) {
  const counts = { high: 0, medium: 0, low: 0 };
  for (const r of risks) counts[r.severity]++;

  return (
    <div className="panel" style={{ padding: 18 }}>
      <h3 style={{ fontSize: 15, marginBottom: 4 }}>Risk register</h3>
      <p className="muted" style={{ fontSize: 12.5, marginTop: 0, marginBottom: 12 }}>
        Derived from due dates, lane age, WIP limits, handoffs and the dependency graph —
        {" "}{counts.high} high · {counts.medium} medium · {counts.low} low
      </p>
      {risks.length === 0 ? (
        <p className="muted" style={{ fontSize: 13 }}>
          No risk signals. Quiet board, honest lanes — keep finishing.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {risks.slice(0, limit).map((r, i) => (
            <div key={`${r.kind}-${r.projectId}-${i}`} className="risk-row">
              <SeverityBadge severity={r.severity} />
              <div style={{ minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 600, color: "var(--text-strong)", fontSize: 13.5 }}>
                    {showProject && r.projectId ? (
                      <Link href={`/projects/${r.projectId}`} style={{ color: "inherit" }}>
                        {r.title}
                      </Link>
                    ) : (
                      r.title
                    )}
                  </span>
                  {showProject && r.projectName && (
                    <span className="muted" style={{ fontSize: 11.5 }}>· {r.projectName}</span>
                  )}
                </div>
                <div className="muted" style={{ fontSize: 12.5 }}>{r.detail}</div>
                <div style={{ fontSize: 12.5, color: "var(--teal)" }}>→ {r.action}</div>
              </div>
            </div>
          ))}
          {risks.length > limit && (
            <p className="muted" style={{ fontSize: 12, margin: 0 }}>
              + {risks.length - limit} more not shown
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function ForecastCard({ result, scope }: { result: ForecastResult; scope: string }) {
  const f = result.forecast;
  return (
    <div className="panel" style={{ padding: 18 }}>
      <h3 style={{ fontSize: 15, marginBottom: 4 }}>Completion forecast</h3>
      <p className="muted" style={{ fontSize: 12.5, marginTop: 0, marginBottom: 12 }}>
        Monte Carlo over the last 12 weeks of real throughput · {scope}
      </p>
      {!f ? (
        <p className="muted" style={{ fontSize: 13 }}>{result.reason}</p>
      ) : (
        <>
          <div style={{ display: "flex", gap: 26, flexWrap: "wrap", marginBottom: 14 }}>
            <div className="metric">
              <strong>{f.remaining}</strong>
              <span>items to drain</span>
            </div>
            <div className="metric">
              <strong style={{ color: "var(--ember)" }}>{f.p50Date}</strong>
              <span>likely (P50 · {f.p50Weeks}w)</span>
            </div>
            <div className="metric">
              <strong style={{ color: "var(--gold)" }}>{f.p85Date}</strong>
              <span>conservative (P85 · {f.p85Weeks}w)</span>
            </div>
            <div className="metric">
              <strong>{f.avgPerWeek}</strong>
              <span>avg / week</span>
            </div>
          </div>
          <div className="flow-bars" role="img" aria-label="weekly throughput history">
            {f.weeklyRates.map((rate, i) => {
              const max = Math.max(1, ...f.weeklyRates);
              return (
                <div key={i} className="flow-bar-col" title={`${rate} finished`}>
                  <div className="flow-bar-val">{rate || ""}</div>
                  <div
                    className="flow-bar"
                    style={{ height: `${(rate / max) * 100}%`, background: "var(--ember)" }}
                  />
                  <div className="flow-bar-lbl">{i - f.weeklyRates.length}w</div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

export function DecisionLog({ decisions, limit = 12 }: { decisions: DecisionEntry[]; limit?: number }) {
  return (
    <div className="panel" style={{ padding: 18 }}>
      <h3 style={{ fontSize: 15, marginBottom: 4 }}>Decision log</h3>
      <p className="muted" style={{ fontSize: 12.5, marginTop: 0, marginBottom: 12 }}>
        Every “decision” note across the project, newest first
      </p>
      {decisions.length === 0 ? (
        <p className="muted" style={{ fontSize: 13 }}>
          No decisions recorded yet — add one from any card&apos;s “Comments &amp; decisions”.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {decisions.slice(0, limit).map((d) => (
            <div key={d.id} style={{ fontSize: 13 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
                <span className="pill pill-decision">decision</span>
                <span style={{ fontWeight: 600, color: "var(--text-strong)" }}>{d.itemTitle}</span>
                <span className="readout muted" style={{ fontSize: 11.5 }}>{fmt(d.createdAt)}</span>
                {d.author && <span className="muted" style={{ fontSize: 11.5 }}>· {d.author}</span>}
              </div>
              <p style={{ margin: "3px 0 0" }}>{d.body}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function OutcomeLedger({
  outcomes,
  showProject = false,
  limit = 12,
}: {
  outcomes: OutcomeEntry[];
  showProject?: boolean;
  limit?: number;
}) {
  return (
    <div className="panel" style={{ padding: 18 }}>
      <h3 style={{ fontSize: 15, marginBottom: 4 }}>Outcome ledger</h3>
      <p className="muted" style={{ fontSize: 12.5, marginTop: 0, marginBottom: 12 }}>
        What actually shipped, and what it produced
      </p>
      {outcomes.length === 0 ? (
        <p className="muted" style={{ fontSize: 13 }}>
          No outcomes recorded yet — they fill in when items reach Done.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {outcomes.slice(0, limit).map((o) => (
            <div key={`${o.projectId}-${o.itemId}`} style={{ fontSize: 13 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
                <span className="pill done">Done</span>
                <span style={{ fontWeight: 600, color: "var(--text-strong)" }}>{o.title}</span>
                {showProject && o.projectName && (
                  <span className="muted" style={{ fontSize: 11.5 }}>· {o.projectName}</span>
                )}
                {o.agent && <span className="pill pill-agent">⇥ {o.agent}</span>}
                <span className="readout muted" style={{ fontSize: 11.5 }}>{fmt(o.doneAt)}</span>
              </div>
              <p className="muted" style={{ margin: "3px 0 0" }}>{o.outcome}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function InsightsPanel({ insights }: { insights: ProjectInsights }) {
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <ForecastCard result={insights.forecast} scope="ranked + development backlog" />
      <RiskRegister risks={insights.risks} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <DecisionLog decisions={insights.decisions} />
        <OutcomeLedger outcomes={insights.outcomes} />
      </div>
    </div>
  );
}
