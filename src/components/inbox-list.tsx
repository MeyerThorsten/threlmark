"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";
import { priority } from "@/lib/priority";
import type { SuggestionView } from "@/lib/schema/types";

type Opt = { id: string; name: string };

export function InboxList({
  projectId,
  initial,
  projects,
}: {
  projectId: string;
  initial: SuggestionView[];
  projects: Opt[];
}) {
  const router = useRouter();
  const [items, setItems] = useState<SuggestionView[]>(initial);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [promoteFor, setPromoteFor] = useState<string | null>(null);
  const others = projects.filter((p) => p.id !== projectId);

  const refresh = useCallback(async () => {
    try {
      const fresh = await api<SuggestionView[]>(`/api/projects/${projectId}/suggestions`);
      setItems(fresh);
    } catch {
      /* keep last good state */
    }
  }, [projectId]);

  useEffect(() => {
    const t = setInterval(refresh, 4000);
    return () => clearInterval(t);
  }, [refresh]);

  async function accept(sugId: string, targetProjectId?: string) {
    setBusyId(sugId);
    try {
      await api(`/api/projects/${projectId}/suggestions/${sugId}/accept`, {
        method: "POST",
        json: targetProjectId ? { targetProjectId } : {},
      });
      setItems((list) => list.filter((s) => s.id !== sugId));
      setPromoteFor(null);
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function dismiss(sugId: string) {
    setBusyId(sugId);
    try {
      await api(`/api/projects/${projectId}/suggestions/${sugId}/dismiss`, { method: "POST" });
      setItems((list) => list.filter((s) => s.id !== sugId));
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  if (items.length === 0) {
    return (
      <div className="empty">
        <p>Inbox is clear.</p>
        <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>
          Other tools drop suggestions into{" "}
          <code style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>
            ~/.threlmark/projects/{projectId}/suggestions/&lt;id&gt;.json
          </code>{" "}
          and they appear here within a few seconds.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {items.map((s) => (
        <article key={s.id} className="panel" style={{ padding: 16 }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="card-meta" style={{ marginTop: 0, marginBottom: 6 }}>
                <span className="chip chip-source">↩ {s.source}</span>
                <span className="chip">{s.category}</span>
              </div>
              <h3 style={{ fontSize: 16, marginBottom: 4 }}>{s.title}</h3>
              {s.description && <p className="muted" style={{ fontSize: 13 }}>{s.description}</p>}
              {s.files && (
                <p className="muted" style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, marginTop: 6 }}>
                  {s.files}
                </p>
              )}
            </div>
            <span className="card-priority">
              <span className="num readout" style={{ fontSize: 19, color: "var(--ember)" }}>
                {priority({
                  impact: s.impact ?? 3,
                  evidence: s.evidence ?? 3,
                  fit: s.fit ?? 3,
                  effort: s.effort ?? 3,
                })}
              </span>
              <span className="lbl">prio</span>
            </span>
          </div>

          <div className="toolbar" style={{ marginTop: 12 }}>
            <button className="btn btn-primary btn-sm" disabled={busyId === s.id} onClick={() => accept(s.id)}>
              Accept here
            </button>
            {others.length > 0 && (
              <div style={{ position: "relative" }}>
                <button
                  className="btn btn-sm"
                  disabled={busyId === s.id}
                  onClick={() => setPromoteFor(promoteFor === s.id ? null : s.id)}
                  aria-expanded={promoteFor === s.id}
                >
                  Accept into… ▾
                </button>
                {promoteFor === s.id && (
                  <div className="popmenu panel">
                    {others.map((p) => (
                      <button key={p.id} className="popmenu-item" onClick={() => accept(s.id, p.id)}>
                        {p.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div className="spacer" />
            <button className="btn btn-ghost btn-sm" disabled={busyId === s.id} onClick={() => dismiss(s.id)}>
              Dismiss
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}
