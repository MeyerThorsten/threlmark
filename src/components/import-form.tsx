"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";

type Opt = { id: string; name: string };

export function ImportForm({
  projects,
  fixedProjectId,
}: {
  projects: Opt[];
  fixedProjectId?: string;
}) {
  const router = useRouter();
  const [target, setTarget] = useState(fixedProjectId ?? projects[0]?.id ?? "");
  const [mode, setMode] = useState<"paste" | "path">("path");
  const [path, setPath] = useState("");
  const [html, setHtml] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!target) {
      setErr("Pick a target project first");
      return;
    }
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const json = mode === "path" ? { path } : { roadmapHtml: html };
      const res = await api<{ imported: number }>(`/api/projects/${target}/import`, {
        method: "POST",
        json,
      });
      setMsg(`Imported ${res.imported} item${res.imported === 1 ? "" : "s"} into ${target}.`);
      router.refresh();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="panel" style={{ maxWidth: 640, padding: 24, display: "flex", flexDirection: "column", gap: 16 }} onSubmit={submit}>
      {!fixedProjectId && (
        <div>
          <label className="field-label" htmlFor="imp-target">Target project</label>
          <select id="imp-target" className="select" value={target} onChange={(e) => setTarget(e.target.value)}>
            {projects.length === 0 && <option value="">No projects — create one first</option>}
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      )}

      <div>
        <span className="field-label">Source</span>
        <div className="toolbar">
          <button type="button" className={`btn btn-sm ${mode === "path" ? "btn-primary" : ""}`} onClick={() => setMode("path")}>
            From file path
          </button>
          <button type="button" className={`btn btn-sm ${mode === "paste" ? "btn-primary" : ""}`} onClick={() => setMode("paste")}>
            Paste HTML
          </button>
        </div>
      </div>

      {mode === "path" ? (
        <div>
          <label className="field-label" htmlFor="imp-path">Absolute path to roadmap.html</label>
          <input
            id="imp-path"
            className="input"
            value={path}
            placeholder="/Users/you/Dev/ideaclyst/plans/roadmap.html"
            onChange={(e) => setPath(e.target.value)}
          />
        </div>
      ) : (
        <div>
          <label className="field-label" htmlFor="imp-html">roadmap.html contents</label>
          <textarea
            id="imp-html"
            className="textarea"
            style={{ minHeight: 160, fontFamily: "var(--font-mono)", fontSize: 12 }}
            value={html}
            onChange={(e) => setHtml(e.target.value)}
          />
        </div>
      )}

      {msg && <p style={{ color: "var(--teal)", fontSize: 13 }}>{msg}</p>}
      {err && <p style={{ color: "var(--rose)", fontSize: 13 }}>{err}</p>}

      <div className="toolbar">
        <button type="submit" className="btn btn-primary" disabled={busy || !target}>
          {busy ? "Importing…" : "Import roadmap"}
        </button>
        <span className="muted" style={{ fontSize: 12.5 }}>
          Re-importing the same file updates existing items (ids are preserved).
        </span>
      </div>
    </form>
  );
}
