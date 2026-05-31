"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/client";
import { generateHandoff, type HandoffFormat } from "@/lib/handoff/generate";
import { humanAge, humanDate, itemAgeMs, isOverdue, isStale } from "@/lib/flow";
import { priority } from "@/lib/priority";
import {
  CATEGORIES,
  LANES,
  LANE_LABELS,
  type Board,
  type ItemComment,
  type Lane,
  type Project,
  type RoadmapItemView,
} from "@/lib/schema/types";
import {
  ItemEditor,
  draftFromItem,
  type ItemDraft,
} from "./item-editor";
import { ProjectSettings } from "./project-settings";

const LANE_VARS: Record<Lane, string> = {
  idea: "var(--lane-idea)",
  ranked: "var(--lane-ranked)",
  development: "var(--lane-development)",
  done: "var(--lane-done)",
};
const PILL_CLASS: Record<Lane, string> = {
  idea: "idea",
  ranked: "rank",
  development: "dev",
  done: "done",
};
const AXES = [
  { key: "impact", label: "Impact" },
  { key: "evidence", label: "Evidence" },
  { key: "fit", label: "Fit" },
  { key: "effort", label: "Effort" },
] as const;

type AddDraft = {
  title: string;
  category: string;
  description: string;
  files: string;
  labels: string;
  impact: number;
  evidence: number;
  fit: number;
  effort: number;
};
const emptyAdd = (): AddDraft => ({
  title: "",
  category: "Build",
  description: "",
  files: "",
  labels: "",
  impact: 4,
  evidence: 3,
  fit: 4,
  effort: 3,
});

function labelsFromText(value: string): string[] | undefined {
  const labels = value
    .split(",")
    .map((label) => label.trim())
    .filter(Boolean);
  const unique = [...new Set(labels)];
  return unique.length ? unique : undefined;
}

export function RoadmapWorkspace({
  projectId,
  projectName,
  repoPath,
  initialItems,
  initialBoard,
  otherProjects = [],
  wipLimits = {},
  lanePolicies = {},
}: {
  projectId: string;
  projectName: string;
  repoPath?: string;
  initialItems: RoadmapItemView[];
  initialBoard: Board;
  otherProjects?: { id: string; name: string }[];
  wipLimits?: Partial<Record<Lane, number>>;
  lanePolicies?: Partial<Record<Lane, string>>;
}) {
  const router = useRouter();
  const [items, setItems] = useState<Record<string, RoadmapItemView>>(() =>
    Object.fromEntries(initialItems.map((i) => [i.id, i])),
  );
  const [lanes, setLanes] = useState<Record<Lane, string[]>>(initialBoard.lanes);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [labelFilter, setLabelFilter] = useState("all");
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<Lane | null>(null);
  const [editing, setEditing] = useState<RoadmapItemView | null>(null);
  const [add, setAdd] = useState<AddDraft>(emptyAdd);
  const [briefTab, setBriefTab] = useState<HandoffFormat>("text");
  const [toast, setToast] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [baseUrl, setBaseUrl] = useState<string | undefined>(undefined);
  const [commentsByItem, setCommentsByItem] = useState<Record<string, ItemComment[]>>({});

  useEffect(() => {
    const t = setTimeout(() => setBaseUrl(window.location.origin), 0);
    return () => clearTimeout(t);
  }, []);

  // Poll for agent reports → toast + auto-move done cards (no manual step).
  const reportSeen = useRef<string>("");
  const armed = useRef(false);
  useEffect(() => {
    let stop = false;
    async function tick() {
      try {
        const res = await api<{ reports: { at: string; agent: string; status: string; title: string; itemId: string }[] }>(
          `/api/projects/${projectId}/reports`,
        );
        const reports = res.reports ?? [];
        if (!reports.length) return;
        const newest = reports[0].at;
        if (!armed.current) {
          reportSeen.current = newest;
          armed.current = true;
          return;
        }
        const fresh = reports.filter((r) => r.at > reportSeen.current);
        if (!fresh.length) return;
        reportSeen.current = newest;
        for (const r of [...fresh].reverse()) {
          setToast(`🤖 ${r.agent} ${r.status}: ${r.title}`);
          if (r.status === "done") {
            const id = r.itemId;
            setItems((m) => (m[id] ? { ...m, [id]: { ...m[id], status: "done" } } : m));
            setLanes((l) => {
              const wasKnown = LANES.some((ln) => l[ln].includes(id));
              const next = Object.fromEntries(
                LANES.map((ln) => [ln, l[ln].filter((x) => x !== id)]),
              ) as Record<Lane, string[]>;
              if (wasKnown && !next.done.includes(id)) next.done.push(id);
              return next;
            });
          }
        }
        setTimeout(() => setToast(null), 4000);
      } catch {
        /* ignore */
      }
    }
    const t0 = setTimeout(tick, 800);
    const t = setInterval(() => { if (!stop) tick(); }, 5000);
    return () => { stop = true; clearTimeout(t0); clearInterval(t); };
  }, [projectId]);

  const all = useMemo(() => Object.values(items), [items]);
  const labelOptions = useMemo(
    () => [...new Set(all.flatMap((item) => item.labels ?? []))].sort((a, b) => a.localeCompare(b)),
    [all],
  );

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  }

  function visibleInLane(lane: Lane): RoadmapItemView[] {
    const q = search.trim().toLowerCase();
    return lanes[lane]
      .map((id) => items[id])
      .filter(Boolean)
      .filter((it) => categoryFilter === "all" || it.category === categoryFilter)
      .filter((it) => labelFilter === "all" || (it.labels ?? []).includes(labelFilter))
      .filter(
        (it) =>
          !q ||
          it.title.toLowerCase().includes(q) ||
          it.description.toLowerCase().includes(q) ||
          it.category.toLowerCase().includes(q) ||
          (it.labels ?? []).some((label) => label.toLowerCase().includes(q)),
      )
      .sort((a, b) => b.priority - a.priority);
  }

  // ----- selection + brief -----
  function toggleSelect(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  const briefItems = useMemo(
    () => all.filter((it) => it.status === "development" || selected.has(it.id)),
    [all, selected],
  );
  const briefIds = useMemo(() => briefItems.map((it) => it.id).sort().join("|"), [briefItems]);
  useEffect(() => {
    if (!briefIds) return;
    let cancelled = false;
    const ids = briefIds.split("|").filter(Boolean);
    Promise.all(
      ids.map(async (id) => {
        try {
          return [id, await api<ItemComment[]>(`/api/projects/${projectId}/items/${id}/comments`)] as const;
        } catch {
          return [id, []] as const;
        }
      }),
    ).then((entries) => {
      if (cancelled) return;
      setCommentsByItem((current) => ({ ...current, ...Object.fromEntries(entries) }));
    });
    return () => {
      cancelled = true;
    };
  }, [briefIds, projectId]);
  const briefItemsWithComments = useMemo(
    () => briefItems.map((item) => ({ ...item, comments: commentsByItem[item.id] ?? [] })),
    [briefItems, commentsByItem],
  );
  const reporting = useMemo(
    () => ({ baseUrl, projectId, agent: "claude" }),
    [baseUrl, projectId],
  );
  const briefContent = useMemo(
    () => generateHandoff({ name: projectName, repoPath } as Project, briefItemsWithComments, briefTab, reporting),
    [briefItemsWithComments, briefTab, projectName, repoPath, reporting],
  );

  async function copyBrief() {
    const md = generateHandoff({ name: projectName, repoPath } as Project, briefItemsWithComments, "markdown", reporting);
    await navigator.clipboard.writeText(md);
    flash(`Copied dev brief (${briefItems.length} item${briefItems.length === 1 ? "" : "s"})`);
  }

  // ----- mutations -----
  async function patchItem(id: string, patch: Partial<RoadmapItemView>) {
    const updated = await api<RoadmapItemView>(`/api/projects/${projectId}/items/${id}`, {
      method: "PATCH",
      json: patch,
    });
    setItems((m) => ({ ...m, [id]: updated }));
    return updated;
  }

  function setScoreLocal(id: string, key: (typeof AXES)[number]["key"], value: number) {
    setItems((m) => {
      const it = m[id];
      if (!it) return m;
      const next = { ...it, [key]: value };
      next.priority = priority(next);
      return { ...m, [id]: next };
    });
  }

  async function moveToLane(id: string, lane: Lane, index?: number) {
    const it = items[id];
    if (!it || it.status === lane) {
      if (it && index === undefined) return;
    }
    // optimistic
    const next = Object.fromEntries(
      LANES.map((l) => [l, lanes[l].filter((x) => x !== id)]),
    ) as Record<Lane, string[]>;
    const at = index === undefined ? next[lane].length : index;
    next[lane].splice(at, 0, id);
    setLanes(next);
    setItems((m) => ({ ...m, [id]: { ...m[id], status: lane } }));
    try {
      await api(`/api/projects/${projectId}/items/${id}/move`, {
        method: "POST",
        json: { toLane: lane, toIndex: at },
      });
      router.refresh();
    } catch {
      setLanes(initialBoard.lanes);
      flash("Move failed");
    }
  }

  async function addItem(e: React.FormEvent) {
    e.preventDefault();
    if (!add.title.trim()) return;
    const created = await api<RoadmapItemView>(`/api/projects/${projectId}/items`, {
      method: "POST",
      json: { ...add, labels: labelsFromText(add.labels), status: "idea" },
    });
    setItems((m) => ({ ...m, [created.id]: created }));
    setLanes((l) => ({ ...l, idea: [...l.idea, created.id] }));
    setAdd(emptyAdd());
    flash("Added to Ideas");
    router.refresh();
  }

  function rankAll() {
    const ideas = all.filter((it) => it.status === "idea");
    if (ideas.length === 0) return flash("No ideas to rank");
    ideas.forEach((it) => moveToLane(it.id, "ranked"));
    flash(`${ideas.length} idea${ideas.length === 1 ? "" : "s"} moved to Ranked`);
  }

  function pushTop(n = 3) {
    const candidates = all
      .filter((it) => it.status === "idea" || it.status === "ranked")
      .sort((a, b) => b.priority - a.priority)
      .slice(0, n);
    if (candidates.length === 0) return flash("Nothing to push");
    setSelected((s) => new Set([...s, ...candidates.map((c) => c.id)]));
    candidates.forEach((c) => moveToLane(c.id, "development"));
    flash(`${candidates.length} pushed to Development`);
  }

  async function saveEdit(id: string, draft: ItemDraft) {
    const updated = await patchItem(id, draft as Partial<RoadmapItemView>);
    setEditing(null);
    const board = await api<Board>(`/api/projects/${projectId}/board`);
    setLanes(board.lanes);
    router.refresh();
    void updated;
  }
  async function removeItem(id: string) {
    await api(`/api/projects/${projectId}/items/${id}`, { method: "DELETE" });
    setItems((m) => { const n = { ...m }; delete n[id]; return n; });
    setLanes((l) => Object.fromEntries(LANES.map((ln) => [ln, l[ln].filter((x) => x !== id)])) as Record<Lane, string[]>);
    setSelected((s) => { const n = new Set(s); n.delete(id); return n; });
    setEditing(null);
    router.refresh();
  }
  async function moveToProject(id: string, toProjectId: string) {
    await api(`/api/projects/${projectId}/items/${id}/move`, { method: "POST", json: { toProjectId } });
    setItems((m) => { const n = { ...m }; delete n[id]; return n; });
    setLanes((l) => Object.fromEntries(LANES.map((ln) => [ln, l[ln].filter((x) => x !== id)])) as Record<Lane, string[]>);
    setEditing(null);
    router.refresh();
  }
  async function makeShared(item: RoadmapItemView) {
    await api("/api/shared", {
      method: "POST",
      json: { title: item.title, description: item.description, category: item.category, fromItems: [`${projectId}/${item.id}`] },
    });
    setEditing(null);
    router.refresh();
    const updated = await api<RoadmapItemView>(`/api/projects/${projectId}/items/${item.id}`);
    setItems((m) => ({ ...m, [item.id]: updated }));
  }

  return (
    <>
      {/* Toolbar */}
      <section className="rl-toolbar" aria-label="Roadmap controls">
        <input
          className="input"
          type="search"
          style={{ flex: "1 1 240px" }}
          placeholder="Search roadmap items"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="select" style={{ width: 180 }} value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} aria-label="Category filter">
          <option value="all">All categories</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className="select" style={{ width: 170 }} value={labelFilter} onChange={(e) => setLabelFilter(e.target.value)} aria-label="Label filter">
          <option value="all">All labels</option>
          {labelOptions.map((label) => <option key={label} value={label}>{label}</option>)}
        </select>
        <button className="btn" onClick={rankAll}>Rank by score</button>
        <button className="btn btn-teal" onClick={() => pushTop(3)}>Push top 3</button>
        <button className="btn btn-primary" onClick={copyBrief}>Copy dev brief</button>
        <button className="btn" onClick={() => setShowSettings(true)} aria-label="Workflow settings" title="WIP limits & lane policies">⚙</button>
      </section>

      <div className="workspace">
        {/* Lanes */}
        <div className="lanes">
          {LANES.map((lane) => {
            const laneItems = visibleInLane(lane);
            return (
              <section
                key={lane}
                className={`lane ${over === lane ? "over" : ""}`}
                onDragOver={(e) => { if (dragId) { e.preventDefault(); setOver(lane); } }}
                onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(null); }}
                onDrop={() => { if (dragId) { moveToLane(dragId, lane); setDragId(null); setOver(null); } }}
                aria-label={`${LANE_LABELS[lane]} lane`}
              >
                <header className="lane-head">
                  <span className="lane-title">
                    <span className="dot" style={{ background: LANE_VARS[lane] }} />
                    {LANE_LABELS[lane]}
                  </span>
                  {(() => {
                    const limit = wipLimits[lane];
                    const over = typeof limit === "number" && laneItems.length > limit;
                    return (
                      <span className={`count ${over ? "over" : ""}`} title={limit ? `WIP limit ${limit}` : undefined}>
                        {laneItems.length}{typeof limit === "number" ? ` / ${limit}` : ""}
                      </span>
                    );
                  })()}
                </header>
                {lanePolicies[lane] && <p className="lane-policy">{lanePolicies[lane]}</p>}
                <div className="stack">
                  {laneItems.map((item) => {
                    const isSel = selected.has(item.id);
                    return (
                      <article
                        key={item.id}
                        className={`feature-card ${dragId === item.id ? "dragging" : ""} ${isSel ? "is-selected" : ""} ${isStale(item) ? "is-stale" : ""}`}
                        draggable
                        onDragStart={() => setDragId(item.id)}
                        onDragEnd={() => { setDragId(null); setOver(null); }}
                      >
                        <div className="feature-top">
                          <div>
                            <h3 className="feature-title">{item.title}</h3>
                            <div className="feature-meta">
                              <span className={`pill ${PILL_CLASS[item.status]}`}>{LANE_LABELS[item.status]}</span>
                              <span className="pill">{item.category}</span>
                              {item.status !== "done" && (
                                <span className="pill pill-age" title="Time in this lane">
                                  ⏱ {humanAge(itemAgeMs(item))}
                                </span>
                              )}
                              {item.dueDate && (
                                <span className={`pill pill-due ${isOverdue(item) ? "overdue" : ""}`}>
                                  due {humanDate(item.dueDate)}
                                </span>
                              )}
                              {item.handoff && (
                                <span className="pill pill-agent" title={`Handed off to ${item.handoff.agent}`}>
                                  ⇥ {item.handoff.agent}
                                </span>
                              )}
                              {item.source && <span className="pill pill-source">↩ {item.source}</span>}
                              {item.sharedRef && <span className="pill pill-shared">⊞ shared</span>}
                              {(item.labels ?? []).map((label) => (
                                <span className="pill pill-label" key={label}>{label}</span>
                              ))}
                              {isSel && <span className="pill selected">Selected</span>}
                            </div>
                          </div>
                          <div className="priority" title="Priority score">{item.priority}</div>
                        </div>
                        {item.description && <p className="feature-desc">{item.description}</p>}
                        <div className="scores">
                          {AXES.map((axis) => (
                            <div className="score" key={axis.key}>
                              <label>
                                <span>{axis.label}</span>
                                <span>{item[axis.key]}</span>
                              </label>
                              <input
                                type="range"
                                min={1}
                                max={5}
                                value={item[axis.key] as number}
                                aria-label={`${item.title} ${axis.label}`}
                                onChange={(e) => setScoreLocal(item.id, axis.key, Number(e.target.value))}
                                onPointerUp={(e) => patchItem(item.id, { [axis.key]: Number((e.target as HTMLInputElement).value) })}
                                onKeyUp={(e) => patchItem(item.id, { [axis.key]: Number((e.target as HTMLInputElement).value) })}
                              />
                            </div>
                          ))}
                        </div>
                        <div className="card-actions">
                          <button className="btn btn-sm" onClick={() => toggleSelect(item.id)}>
                            {isSel ? "Unselect" : "Select"}
                          </button>
                          {item.status !== "development" && item.status !== "done" && (
                            <button className="btn btn-sm btn-teal" onClick={() => moveToLane(item.id, "development")}>Push</button>
                          )}
                          {item.status !== "ranked" && item.status !== "done" && (
                            <button className="btn btn-sm" onClick={() => moveToLane(item.id, "ranked")}>Rank</button>
                          )}
                          {item.status !== "done" ? (
                            <button className="btn btn-sm" onClick={() => moveToLane(item.id, "done")}>Done</button>
                          ) : (
                            <button className="btn btn-sm" onClick={() => moveToLane(item.id, "ranked")}>Reopen</button>
                          )}
                          <button className="btn btn-sm btn-ghost" onClick={() => setEditing(item)}>Edit</button>
                        </div>
                      </article>
                    );
                  })}
                  {laneItems.length === 0 && <p className="empty" style={{ padding: 14 }}>No items.</p>}
                </div>
              </section>
            );
          })}
        </div>

        {/* Side panel */}
        <aside className="side">
          <section className="panel">
            <h2>Add item</h2>
            <form className="form-grid" style={{ display: "grid", gap: 9 }} onSubmit={addItem}>
              <input className="input" maxLength={96} required placeholder="Item title" value={add.title} onChange={(e) => setAdd({ ...add, title: e.target.value })} />
              <select className="select" value={add.category} onChange={(e) => setAdd({ ...add, category: e.target.value })}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <textarea className="textarea" maxLength={420} placeholder="Problem, user value, and expected result" value={add.description} onChange={(e) => setAdd({ ...add, description: e.target.value })} />
              <input className="input" maxLength={180} placeholder="Likely files or modules" value={add.files} onChange={(e) => setAdd({ ...add, files: e.target.value })} />
              <input className="input" maxLength={140} placeholder="Labels, comma-separated" value={add.labels} onChange={(e) => setAdd({ ...add, labels: e.target.value })} />
              {AXES.map((axis) => (
                <div key={axis.key} style={{ display: "grid", gridTemplateColumns: "1fr 52px", gap: 8, alignItems: "center" }}>
                  <label className="field-label" style={{ margin: 0 }} htmlFor={`add-${axis.key}`}>
                    {axis.label === "Fit" ? "Strategic fit" : axis.label}
                  </label>
                  <input id={`add-${axis.key}`} type="range" min={1} max={5} value={add[axis.key]} onChange={(e) => setAdd({ ...add, [axis.key]: Number(e.target.value) })} />
                </div>
              ))}
              <button className="btn btn-primary" type="submit" disabled={!add.title.trim()}>Add to Ideas</button>
            </form>
          </section>

          <section className="panel">
            <h2>Development brief</h2>
            <div className="tabs">
              {(["text", "markdown", "json"] as HandoffFormat[]).map((f) => (
                <button key={f} className={`tab ${briefTab === f ? "active" : ""}`} type="button" onClick={() => setBriefTab(f)}>
                  {f === "text" ? "Queue" : f === "markdown" ? "Markdown" : "JSON"}
                </button>
              ))}
            </div>
            <pre className="brief">{briefContent}</pre>
            <div className="card-actions">
              <button className="btn btn-sm" type="button" onClick={copyBrief}>Copy markdown</button>
              <span className="muted readout" style={{ fontSize: 11, alignSelf: "center" }}>
                {briefItems.length} in brief · {selected.size} selected
              </span>
            </div>
          </section>
        </aside>
      </div>

      {editing && (
        <ItemEditor
          heading="Edit item"
          initial={draftFromItem(editing)}
          item={editing}
          onSave={(d) => saveEdit(editing.id, d)}
          onCancel={() => setEditing(null)}
          onDelete={() => removeItem(editing.id)}
          crossProject={{
            otherProjects,
            onMove: (toProjectId) => moveToProject(editing.id, toProjectId),
            onShare: () => makeShared(editing),
          }}
        />
      )}

      {showSettings && (
        <ProjectSettings
          projectId={projectId}
          initialLimits={wipLimits}
          initialPolicies={lanePolicies}
          onClose={() => setShowSettings(false)}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
