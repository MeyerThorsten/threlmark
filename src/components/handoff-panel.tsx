"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { byPriorityDesc } from "@/lib/priority";
import { AGENTS, LANE_LABELS, type Agent, type HandoffRecord, type RoadmapItemView } from "@/lib/schema/types";

type Format = "markdown" | "text" | "json";
const EXT: Record<Format, string> = { markdown: "md", text: "txt", json: "json" };

export function HandoffPanel({
  projectId,
  items,
}: {
  projectId: string;
  items: RoadmapItemView[];
}) {
  const router = useRouter();
  const sorted = useMemo(() => [...items].sort(byPriorityDesc), [items]);
  const statusById = useMemo(
    () => new Map(items.map((i) => [i.id, i.status])),
    [items],
  );
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(items.filter((i) => i.status === "development").map((i) => i.id)),
  );
  const [format, setFormat] = useState<Format>("markdown");
  const [agent, setAgent] = useState<Agent>("claude");
  const [moveToDev, setMoveToDev] = useState(true);
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [handoffs, setHandoffs] = useState<HandoffRecord[]>([]);

  const loadHandoffs = useCallback(async () => {
    try {
      setHandoffs(await api<HandoffRecord[]>(`/api/projects/${projectId}/handoffs`));
    } catch {
      /* ignore */
    }
  }, [projectId]);
  useEffect(() => {
    const t = setTimeout(loadHandoffs, 0);
    return () => clearTimeout(t);
  }, [loadHandoffs]);

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function generate(record: boolean) {
    setBusy(true);
    setCopied(false);
    setNote(null);
    try {
      const res = await api<{ content: string; recorded?: { count: number } }>(
        `/api/projects/${projectId}/handoff`,
        {
          method: "POST",
          json: record
            ? { itemIds: [...selected], format, record: true, agent, moveToDevelopment: moveToDev }
            : { itemIds: [...selected], format },
        },
      );
      setContent(res.content);
      if (record && res.recorded) {
        setNote(`Handed off ${res.recorded.count} item(s) to ${agent}.`);
        await loadHandoffs();
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function download() {
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${projectId}-handoff.${EXT[format]}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(280px, 360px) 1fr", gap: 18, alignItems: "start" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div className="panel" style={{ padding: 16 }}>
          <h3 style={{ fontSize: 15, marginBottom: 4 }}>Select items</h3>
          <p className="muted" style={{ fontSize: 12.5, marginBottom: 12 }}>Defaults to the Development lane.</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 360, overflowY: "auto" }}>
            {sorted.length === 0 && <p className="muted" style={{ fontSize: 13 }}>No items in this project.</p>}
            {sorted.map((item) => (
              <label key={item.id} className="select-row">
                <input type="checkbox" checked={selected.has(item.id)} onChange={() => toggle(item.id)} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ color: "var(--text-strong)" }}>{item.title}</span>
                  <span className="muted" style={{ fontSize: 11.5, display: "block" }}>
                    {LANE_LABELS[item.status]} · {item.category}
                    {item.handoff ? ` · ⇥ ${item.handoff.agent}` : ""}
                  </span>
                </span>
                <span className="readout" style={{ color: "var(--ember)" }}>{item.priority}</span>
              </label>
            ))}
          </div>
        </div>

        {handoffs.length > 0 && (
          <div className="panel" style={{ padding: 16 }}>
            <h3 style={{ fontSize: 15, marginBottom: 10 }}>Recent handoffs</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {handoffs.slice(0, 6).map((h) => {
                const shipped = h.itemIds.filter((id) => statusById.get(id) === "done").length;
                const done = shipped === h.itemIds.length;
                return (
                  <div key={h.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 }}>
                    <span className="pill pill-agent">⇥ {h.agent}</span>
                    <span className="muted">{new Date(h.createdAt).toLocaleDateString()}</span>
                    <div className="spacer" />
                    <span className="readout" style={{ color: done ? "var(--green)" : "var(--muted)" }}>
                      {shipped}/{h.itemIds.length} shipped
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="panel" style={{ padding: 16 }}>
        <div className="toolbar" style={{ marginBottom: 12 }}>
          {(["markdown", "text", "json"] as Format[]).map((f) => (
            <button key={f} className={`btn btn-sm ${format === f ? "btn-primary" : ""}`} onClick={() => setFormat(f)}>
              {f === "markdown" ? "Claude/Codex brief" : f === "text" ? "Queue text" : "JSON"}
            </button>
          ))}
          <div className="spacer" />
          <button className="btn btn-sm" disabled={busy} onClick={() => generate(false)}>
            {busy ? "…" : "Preview"}
          </button>
        </div>

        <div className="toolbar" style={{ marginBottom: 12, paddingBottom: 12, borderBottom: "1px solid var(--border)" }}>
          <span className="field-label" style={{ margin: 0 }}>Hand off to</span>
          <select className="select" style={{ width: 130 }} value={agent} onChange={(e) => setAgent(e.target.value as Agent)}>
            {AGENTS.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <label className="select-row" style={{ padding: 0, gap: 6 }}>
            <input type="checkbox" checked={moveToDev} onChange={(e) => setMoveToDev(e.target.checked)} />
            <span style={{ fontSize: 12.5 }}>move to Development</span>
          </label>
          <div className="spacer" />
          <button className="btn btn-teal btn-sm" disabled={busy || selected.size === 0} onClick={() => generate(true)}>
            {busy ? "…" : "Generate & mark handed off"}
          </button>
        </div>

        {note && <p style={{ color: "var(--teal)", fontSize: 13, marginTop: 0 }}>{note}</p>}

        {content ? (
          <>
            <div className="toolbar" style={{ marginBottom: 8 }}>
              <span className="muted readout" style={{ fontSize: 11 }}>{selected.size} selected</span>
              <div className="spacer" />
              <button className="btn btn-sm" onClick={copy}>{copied ? "Copied ✓" : "Copy"}</button>
              <button className="btn btn-sm" onClick={download}>Download .{EXT[format]}</button>
            </div>
            <pre className="codeblock">{content}</pre>
          </>
        ) : (
          <div className="empty" style={{ padding: 30 }}>
            Pick items, then <b>Preview</b> the brief — or <b>Generate &amp; mark handed off</b> to start tracking brief → shipped.
          </div>
        )}
      </div>
    </div>
  );
}
