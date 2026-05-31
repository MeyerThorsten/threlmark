import { type PortfolioFlow } from "@/lib/schema/types";

export function PortfolioFlowStrip({ flow }: { flow: PortfolioFlow }) {
  const inDev = flow.wip.development;
  const staleCount = flow.aging.filter((a) => a.stale).length;
  const shipped8w = flow.throughput.reduce((s, b) => s + b.count, 0);
  const thisWeek = flow.throughput.at(-1)?.count ?? 0;
  const agentTotal = flow.agentThroughput.reduce((s, a) => s + a.total, 0);

  const tiles = [
    { label: "In development", value: inDev, hint: "across all projects" },
    { label: "Shipped · this wk", value: thisWeek, hint: `${shipped8w} in 8 weeks` },
    { label: "Aging / stale", value: `${flow.aging.length} / ${staleCount}`, hint: "items in progress", warn: staleCount > 0 },
    { label: "Agent-shipped", value: agentTotal, hint: flow.agentThroughput.map((a) => `${a.agent} ${a.total}`).join(" · ") || "none yet" },
    { label: "Stalled briefs", value: flow.stalled.length, hint: "handed off, overdue", warn: flow.stalled.length > 0 },
  ];

  return (
    <div className="panel" style={{ padding: 16, marginBottom: 22 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <h3 style={{ fontSize: 14, textTransform: "uppercase", letterSpacing: "0.08em", color: "#596273" }}>Portfolio flow</h3>
        <span className="muted" style={{ fontSize: 12 }}>· {flow.projectCount} project{flow.projectCount === 1 ? "" : "s"}</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
        {tiles.map((t) => (
          <div key={t.label} className={`flow-wip-tile ${t.warn ? "over" : ""}`}>
            <span className="flow-wip-num" style={{ color: t.warn ? "var(--rose)" : "var(--ember)" }}>{t.value}</span>
            <span className="flow-wip-lbl">{t.label}</span>
            <span className="muted" style={{ display: "block", fontSize: 11, marginTop: 3 }}>{t.hint}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
