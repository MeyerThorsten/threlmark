import { humanAge } from "@/lib/flow";
import {
  LANES,
  LANE_LABELS,
  type FlowMetrics,
  type Lane,
  type ThroughputBucket,
} from "@/lib/schema/types";

const LANE_VARS: Record<Lane, string> = {
  idea: "var(--lane-idea)",
  ranked: "var(--lane-ranked)",
  development: "var(--lane-development)",
  done: "var(--lane-done)",
};

function Bars({ data, color = "var(--ember)" }: { data: ThroughputBucket[]; color?: string }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <div className="flow-bars" role="img" aria-label="weekly counts">
      {data.map((d) => (
        <div key={d.weekStart} className="flow-bar-col" title={`${d.weekStart}: ${d.count}`}>
          <div className="flow-bar-val">{d.count || ""}</div>
          <div className="flow-bar" style={{ height: `${(d.count / max) * 100}%`, background: color }} />
          <div className="flow-bar-lbl">{d.weekStart.slice(5)}</div>
        </div>
      ))}
    </div>
  );
}

export function FlowPanel({ flow, wipLimits = {} }: { flow: FlowMetrics; wipLimits?: Partial<Record<Lane, number>> }) {
  const totalThroughput = flow.throughput.reduce((s, b) => s + b.count, 0);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {/* WIP row */}
      <div className="panel" style={{ padding: 18 }}>
        <h3 style={{ fontSize: 15, marginBottom: 12 }}>Work in progress</h3>
        <div className="flow-wip">
          {LANES.map((lane) => {
            const limit = wipLimits[lane];
            const over = !!flow.overLimit[lane];
            return (
              <div key={lane} className={`flow-wip-tile ${over ? "over" : ""}`}>
                <span className="flow-wip-num" style={{ color: LANE_VARS[lane] }}>
                  {flow.wip[lane]}{typeof limit === "number" ? <span className="flow-wip-lim"> / {limit}</span> : null}
                </span>
                <span className="flow-wip-lbl">{LANE_LABELS[lane]}</span>
                {over && <span className="flow-over">over limit</span>}
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {/* Throughput */}
        <div className="panel" style={{ padding: 18 }}>
          <h3 style={{ fontSize: 15, marginBottom: 4 }}>Throughput</h3>
          <p className="muted" style={{ fontSize: 12.5, marginTop: 0, marginBottom: 12 }}>
            Items reaching Done per week · {totalThroughput} in 8 weeks
          </p>
          <Bars data={flow.throughput} />
        </div>

        {/* Cycle time */}
        <div className="panel" style={{ padding: 18 }}>
          <h3 style={{ fontSize: 15, marginBottom: 4 }}>Cycle time</h3>
          <p className="muted" style={{ fontSize: 12.5, marginTop: 0, marginBottom: 12 }}>
            Development → Done, median
          </p>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
            <span className="readout" style={{ fontSize: 40, fontWeight: 900, color: "var(--ember)" }}>
              {flow.cycleTimeMedianMs !== null ? humanAge(flow.cycleTimeMedianMs) : "—"}
            </span>
            <span className="muted" style={{ fontSize: 13 }}>
              from {flow.cycleTimeSamples} shipped item{flow.cycleTimeSamples === 1 ? "" : "s"}
            </span>
          </div>
        </div>
      </div>

      {/* Agent throughput */}
      <div className="panel" style={{ padding: 18 }}>
        <h3 style={{ fontSize: 15, marginBottom: 12 }}>Agent throughput <span className="muted" style={{ fontWeight: 500, fontSize: 12.5 }}>· handed-off items shipped per week</span></h3>
        {flow.agentThroughput.length === 0 ? (
          <p className="muted" style={{ fontSize: 13 }}>No handed-off items shipped yet. Use “Generate &amp; mark handed off” on the Handoff tab.</p>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(3, flow.agentThroughput.length)}, 1fr)`, gap: 16 }}>
            {flow.agentThroughput.map((a) => (
              <div key={a.agent}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
                  <span className="pill pill-agent">⇥ {a.agent}</span>
                  <span className="readout muted" style={{ fontSize: 12 }}>{a.total} total</span>
                </div>
                <Bars data={a.weeks} color="#6d28d9" />
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {/* Aging */}
        <div className="panel" style={{ padding: 18 }}>
          <h3 style={{ fontSize: 15, marginBottom: 12 }}>Aging work</h3>
          {flow.aging.length === 0 ? (
            <p className="muted" style={{ fontSize: 13 }}>Nothing in progress.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {flow.aging.slice(0, 8).map((a) => (
                <div key={`${a.projectId}-${a.id}`} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                  <span style={{ color: "var(--text-strong)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.title}</span>
                  {a.projectName && <span className="muted" style={{ fontSize: 11 }}>· {a.projectName}</span>}
                  <div className="spacer" />
                  <span className={`readout ${a.stale ? "" : "muted"}`} style={{ fontSize: 12, color: a.stale ? "var(--rose)" : undefined }}>
                    {humanAge(a.ageMs)}{a.stale ? " ⚠" : ""}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Stalled briefs */}
        <div className="panel" style={{ padding: 18 }}>
          <h3 style={{ fontSize: 15, marginBottom: 12 }}>Stalled briefs</h3>
          {flow.stalled.length === 0 ? (
            <p className="muted" style={{ fontSize: 13 }}>No handed-off items are overdue.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {flow.stalled.slice(0, 8).map((s) => (
                <div key={`${s.projectId}-${s.id}`} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                  <span className="pill pill-agent">⇥ {s.agent}</span>
                  <span style={{ color: "var(--text-strong)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.title}</span>
                  <div className="spacer" />
                  <span className="readout" style={{ fontSize: 12, color: "var(--rose)" }}>{humanAge(s.ageMs)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
