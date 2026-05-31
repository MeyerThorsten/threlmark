"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { LANES, LANE_LABELS, type Lane } from "@/lib/schema/types";

type Limits = Partial<Record<Lane, number>>;
type Policies = Partial<Record<Lane, string>>;

export function ProjectSettings({
  projectId,
  initialLimits,
  initialPolicies,
  onClose,
}: {
  projectId: string;
  initialLimits: Limits;
  initialPolicies: Policies;
  onClose: () => void;
}) {
  const router = useRouter();
  const [limits, setLimits] = useState<Limits>(initialLimits);
  const [policies, setPolicies] = useState<Policies>(initialPolicies);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      // Send full objects so cleared fields are removed.
      const wipLimits: Limits = {};
      const lanePolicies: Policies = {};
      for (const l of LANES) {
        if (typeof limits[l] === "number" && limits[l]! > 0) wipLimits[l] = limits[l];
        if (policies[l]?.trim()) lanePolicies[l] = policies[l]!.trim();
      }
      await api(`/api/projects/${projectId}`, {
        method: "PATCH",
        json: { wipLimits, lanePolicies },
      });
      onClose();
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to save");
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal panel" role="dialog" aria-modal="true" aria-label="Project settings" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2 style={{ fontSize: 20 }}>Workflow settings</h2>
        </div>
        <div className="modal-body">
          <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
            Set WIP limits to keep work flowing, and a short policy for what each lane means.
          </p>
          {LANES.filter((l) => l !== "done").map((lane) => (
            <div key={lane} style={{ display: "grid", gridTemplateColumns: "1fr 96px", gap: 12, alignItems: "end" }}>
              <div>
                <label className="field-label" htmlFor={`pol-${lane}`}>{LANE_LABELS[lane]} policy</label>
                <input
                  id={`pol-${lane}`}
                  className="input"
                  placeholder="e.g. ready to build, scoped"
                  value={policies[lane] ?? ""}
                  onChange={(e) => setPolicies((p) => ({ ...p, [lane]: e.target.value }))}
                />
              </div>
              <div>
                <label className="field-label" htmlFor={`wip-${lane}`}>WIP limit</label>
                <input
                  id={`wip-${lane}`}
                  className="input"
                  type="number"
                  min={0}
                  placeholder="—"
                  value={limits[lane] ?? ""}
                  onChange={(e) =>
                    setLimits((m) => ({ ...m, [lane]: e.target.value ? Number(e.target.value) : undefined }))
                  }
                />
              </div>
            </div>
          ))}
          {err && <p style={{ color: "var(--rose)", fontSize: 13 }}>{err}</p>}
        </div>
        <div className="modal-foot">
          <div className="spacer" />
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</button>
        </div>
      </div>
    </div>
  );
}
