"use client";

import { useState } from "react";
import { CATEGORIES, LANES, LANE_LABELS, type RoadmapItemView } from "@/lib/schema/types";
import { priority } from "@/lib/priority";

const AXES = [
  { key: "impact", label: "Impact" },
  { key: "evidence", label: "Evidence" },
  { key: "fit", label: "Fit" },
  { key: "effort", label: "Effort" },
] as const;

export type ItemDraft = {
  title: string;
  category: string;
  status: string;
  impact: number;
  evidence: number;
  fit: number;
  effort: number;
  description: string;
  files: string;
  acceptance: string[];
};

export function emptyDraft(): ItemDraft {
  return {
    title: "",
    category: "Build",
    status: "idea",
    impact: 4,
    evidence: 3,
    fit: 4,
    effort: 3,
    description: "",
    files: "",
    acceptance: [],
  };
}

export function draftFromItem(item: RoadmapItemView): ItemDraft {
  return {
    title: item.title,
    category: item.category,
    status: item.status,
    impact: item.impact,
    evidence: item.evidence,
    fit: item.fit,
    effort: item.effort,
    description: item.description,
    files: item.files,
    acceptance: item.acceptance,
  };
}

export type CrossProjectControls = {
  otherProjects: { id: string; name: string }[];
  onMove: (toProjectId: string) => Promise<void>;
  onShare: () => Promise<void>;
};

export function ItemEditor({
  initial,
  heading,
  onSave,
  onCancel,
  onDelete,
  crossProject,
}: {
  initial: ItemDraft;
  heading: string;
  onSave: (draft: ItemDraft) => Promise<void>;
  onCancel: () => void;
  onDelete?: () => Promise<void>;
  crossProject?: CrossProjectControls;
}) {
  const [draft, setDraft] = useState<ItemDraft>(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [moveTo, setMoveTo] = useState("");

  const set = <K extends keyof ItemDraft>(k: K, v: ItemDraft[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setErr(null);
    try {
      await fn();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong");
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div
        className="modal panel"
        role="dialog"
        aria-modal="true"
        aria-label={heading}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2 style={{ fontSize: 21 }}>{heading}</h2>
          <div className="card-priority">
            <div className="num readout">{priority(draft)}</div>
            <div className="lbl">priority</div>
          </div>
        </div>

        <div className="modal-body">
          <div>
            <label className="field-label" htmlFor="ie-title">Title</label>
            <input
              id="ie-title"
              className="input"
              value={draft.title}
              autoFocus
              onChange={(e) => set("title", e.target.value)}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div>
              <label className="field-label" htmlFor="ie-cat">Category</label>
              <select
                id="ie-cat"
                className="select"
                value={draft.category}
                onChange={(e) => set("category", e.target.value)}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label" htmlFor="ie-lane">Lane</label>
              <select
                id="ie-lane"
                className="select"
                value={draft.status}
                onChange={(e) => set("status", e.target.value)}
              >
                {LANES.map((l) => (
                  <option key={l} value={l}>{LANE_LABELS[l]}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="axes">
            {AXES.map((axis) => (
              <div key={axis.key} className="axis">
                <label className="field-label" htmlFor={`ie-${axis.key}`}>
                  {axis.label} · <b style={{ color: "var(--text)" }}>{draft[axis.key]}</b>
                </label>
                <input
                  id={`ie-${axis.key}`}
                  type="range"
                  min={1}
                  max={5}
                  value={draft[axis.key]}
                  onChange={(e) => set(axis.key, Number(e.target.value))}
                  className="range"
                />
              </div>
            ))}
          </div>

          <div>
            <label className="field-label" htmlFor="ie-desc">Description</label>
            <textarea
              id="ie-desc"
              className="textarea"
              value={draft.description}
              onChange={(e) => set("description", e.target.value)}
            />
          </div>

          <div>
            <label className="field-label" htmlFor="ie-files">Target files (comma-separated)</label>
            <input
              id="ie-files"
              className="input"
              value={draft.files}
              placeholder="src/lib/foo.ts, src/app/page.tsx"
              onChange={(e) => set("files", e.target.value)}
            />
          </div>

          <div>
            <label className="field-label" htmlFor="ie-acc">Acceptance criteria (one per line)</label>
            <textarea
              id="ie-acc"
              className="textarea"
              value={draft.acceptance.join("\n")}
              onChange={(e) =>
                set("acceptance", e.target.value.split("\n").map((l) => l.trim()).filter(Boolean))
              }
            />
          </div>

          {crossProject && (
            <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14 }}>
              <span className="field-label">Cross-project</span>
              <div className="toolbar">
                <select
                  className="select"
                  style={{ flex: 1 }}
                  value={moveTo}
                  onChange={(e) => setMoveTo(e.target.value)}
                  aria-label="Move to project"
                  disabled={crossProject.otherProjects.length === 0}
                >
                  <option value="">
                    {crossProject.otherProjects.length === 0 ? "No other projects" : "Move to project…"}
                  </option>
                  {crossProject.otherProjects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={busy || !moveTo}
                  onClick={() => run(() => crossProject.onMove(moveTo))}
                >
                  Move
                </button>
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={busy}
                  onClick={() => run(crossProject.onShare)}
                  title="Refactor this into a shared item referenced across projects"
                >
                  ⊞ Make shared
                </button>
              </div>
            </div>
          )}

          {err && <p style={{ color: "var(--rose)", fontSize: 13 }}>{err}</p>}
        </div>

        <div className="modal-foot">
          {onDelete && (
            <button
              type="button"
              className="btn btn-ghost"
              style={{ color: "var(--rose)" }}
              disabled={busy}
              onClick={() => run(onDelete)}
            >
              Delete
            </button>
          )}
          <div className="spacer" />
          <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || !draft.title.trim()}
            onClick={() => run(() => onSave(draft))}
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
