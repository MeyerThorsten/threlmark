import Link from "next/link";
import { CopyButton } from "@/components/copy-button";
import { buildPlan, planMarkdown } from "@/lib/plan";
import { LANE_LABELS } from "@/lib/schema/types";

export const dynamic = "force-dynamic";

const PILL_CLASS: Record<string, string> = {
  idea: "idea",
  ranked: "rank",
  development: "dev",
  done: "done",
};

export default async function PlanPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const limit = Math.min(50, Math.max(1, Number(sp.limit) || 10));
  const plan = await buildPlan({ limit });
  const md = planMarkdown(plan);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-kicker">Today, decided for you</div>
          <h1 className="page-title">Plan my day</h1>
          <p className="page-desc">
            One queue across every project — priority weighted by status, boosted by risk
            (overdue, due-soon, bottlenecks, stalled handoffs, stale work). Each entry says why
            it&apos;s here, so you can argue with it.
          </p>
        </div>
        <div className="toolbar" style={{ alignItems: "flex-start" }}>
          <CopyButton text={md} label="Copy as markdown" />
        </div>
      </div>

      <div className="panel" style={{ padding: 18 }}>
        <p className="muted" style={{ fontSize: 12.5, marginTop: 0 }}>
          Top {plan.entries.length} of {plan.totalOpen} open items ·{" "}
          <Link href={`/plan?limit=${limit === 10 ? 25 : 10}`}>
            show {limit === 10 ? 25 : 10}
          </Link>{" "}
          · agent-readable at <code style={{ fontFamily: "var(--font-mono)" }}>/api/plan</code>
        </p>
        {plan.entries.length === 0 ? (
          <p className="muted" style={{ fontSize: 13 }}>Nothing open anywhere. Enjoy it.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {plan.entries.map((e, i) => (
              <div key={`${e.projectId}-${e.item.id}`} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                <span className="readout" style={{ fontSize: 15, fontWeight: 900, color: "var(--faint)", width: 26, textAlign: "right" }}>
                  {i + 1}
                </span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
                    <Link
                      href={`/projects/${e.projectId}?focus=${e.item.id}`}
                      style={{ fontWeight: 600, color: "var(--text-strong)", fontSize: 14 }}
                    >
                      {e.item.title}
                    </Link>
                    <span className="muted" style={{ fontSize: 12, display: "inline-flex", alignItems: "center", gap: 5 }}>
                      <span className="dot" style={{ width: 8, height: 8, borderRadius: "50%", background: e.projectColor || "var(--ember)", display: "inline-block" }} />
                      {e.projectName}
                    </span>
                    <span className={`pill ${PILL_CLASS[e.item.status]}`}>{LANE_LABELS[e.item.status]}</span>
                  </div>
                  {e.reasons.length > 0 && (
                    <div style={{ fontSize: 12.5, color: "var(--teal)" }}>
                      {e.reasons.map((r, j) => (
                        <span key={j}>{j > 0 && " · "}→ {r}</span>
                      ))}
                    </div>
                  )}
                </div>
                <span className="readout" title="plan score (priority × status + risk boosts)" style={{ fontWeight: 800, color: "var(--ember)" }}>
                  {e.score}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
