"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import {
  CATEGORIES,
  LANES,
  LANE_LABELS,
  type CommentKind,
  type ItemComment,
  type RoadmapItemView,
} from "@/lib/schema/types";
import { priority } from "@/lib/priority";
import { buildActivity } from "@/lib/activity";

const KIND_GLYPH: Record<string, string> = {
  create: "✦",
  move: "→",
  handoff: "⇥",
  report: "🤖",
};

function fmt(at: string): string {
  const d = new Date(at);
  return Number.isNaN(d.getTime())
    ? at
    : d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

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
  labels: string[];
  dueDate: string;
  scheduledFor: string;
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
    labels: [],
    dueDate: "",
    scheduledFor: "",
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
    labels: item.labels ?? [],
    dueDate: item.dueDate ?? "",
    scheduledFor: item.scheduledFor ?? "",
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
  item,
}: {
  initial: ItemDraft;
  heading: string;
  onSave: (draft: ItemDraft) => Promise<void>;
  onCancel: () => void;
  onDelete?: () => Promise<void>;
  crossProject?: CrossProjectControls;
  item?: RoadmapItemView;
}) {
  const [draft, setDraft] = useState<ItemDraft>(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [moveTo, setMoveTo] = useState("");
  const [labelsText, setLabelsText] = useState(initial.labels.join(", "));
  const [comments, setComments] = useState<ItemComment[]>([]);
  const [commentKind, setCommentKind] = useState<CommentKind>("comment");
  const [commentBody, setCommentBody] = useState("");
  const [commentAuthor, setCommentAuthor] = useState("");
  const [commentBusy, setCommentBusy] = useState(false);

  useEffect(() => {
    if (!item) return;
    let cancelled = false;
    api<ItemComment[]>(`/api/projects/${item.projectId}/items/${item.id}/comments`)
      .then((res) => {
        if (!cancelled) setComments(res);
      })
      .catch(() => {
        if (!cancelled) setComments([]);
      });
    return () => {
      cancelled = true;
    };
  }, [item]);

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

  async function addComment() {
    if (!item || !commentBody.trim()) return;
    setCommentBusy(true);
    setErr(null);
    try {
      const created = await api<ItemComment>(`/api/projects/${item.projectId}/items/${item.id}/comments`, {
        method: "POST",
        json: {
          kind: commentKind,
          body: commentBody,
          author: commentAuthor,
        },
      });
      setComments((list) => [...list, created]);
      setCommentBody("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not add comment");
    } finally {
      setCommentBusy(false);
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

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div>
              <label className="field-label" htmlFor="ie-scheduled">Scheduled</label>
              <input
                id="ie-scheduled"
                className="input"
                type="date"
                value={draft.scheduledFor}
                onChange={(e) => set("scheduledFor", e.target.value)}
              />
            </div>
            <div>
              <label className="field-label" htmlFor="ie-due">Due date</label>
              <input
                id="ie-due"
                className="input"
                type="date"
                value={draft.dueDate}
                onChange={(e) => set("dueDate", e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="field-label" htmlFor="ie-labels">Labels (comma-separated)</label>
            <input
              id="ie-labels"
              className="input"
              value={labelsText}
              placeholder="trello, collaboration, import"
              onChange={(e) => {
                setLabelsText(e.target.value);
                set(
                  "labels",
                  [...new Set(e.target.value.split(",").map((label) => label.trim()).filter(Boolean))],
                );
              }}
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

          {item && (
            <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14 }}>
              <span className="field-label">Comments &amp; decisions</span>
              <div className="comments-list">
                {comments.length === 0 ? (
                  <p className="muted" style={{ fontSize: 13, margin: 0 }}>No notes yet.</p>
                ) : (
                  comments.map((comment) => (
                    <div key={comment.id} className="comment-row">
                      <div className="comment-meta">
                        <span className={`pill ${comment.kind === "decision" ? "pill-decision" : ""}`}>
                          {comment.kind}
                        </span>
                        <span className="readout muted">{fmt(comment.createdAt)}</span>
                      </div>
                      <p>{comment.body}</p>
                      {comment.author && <span className="muted" style={{ fontSize: 12 }}>{comment.author}</span>}
                    </div>
                  ))
                )}
              </div>
              <div className="comment-form">
                <select
                  className="select"
                  value={commentKind}
                  onChange={(e) => setCommentKind(e.target.value as CommentKind)}
                  aria-label="Comment kind"
                >
                  <option value="comment">Comment</option>
                  <option value="decision">Decision</option>
                </select>
                <input
                  className="input"
                  value={commentAuthor}
                  placeholder="Author"
                  onChange={(e) => setCommentAuthor(e.target.value)}
                />
                <textarea
                  className="textarea"
                  value={commentBody}
                  placeholder="Add a note"
                  onChange={(e) => setCommentBody(e.target.value)}
                />
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={commentBusy || !commentBody.trim()}
                  onClick={addComment}
                >
                  Add note
                </button>
              </div>
            </div>
          )}

          {item && (
            <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14 }}>
              <span className="field-label">Activity</span>
              <div className="activity">
                {buildActivity(item).map((a, i) => (
                  <div key={i} className="activity-item">
                    <span className="activity-glyph">{KIND_GLYPH[a.kind]}</span>
                    <span className="activity-body">
                      <span>{a.label}</span>
                      {a.detail && <span className="activity-detail">{a.detail}</span>}
                    </span>
                    <span className="activity-at readout">{fmt(a.at)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

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
