"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";

type Opt = { id: string; name: string };
type ImportSource = "roadmap" | "trello" | "github";
type ImportMode = "path" | "paste" | "api";

export function ImportForm({
  projects,
  fixedProjectId,
}: {
  projects: Opt[];
  fixedProjectId?: string;
}) {
  const router = useRouter();
  const [target, setTarget] = useState(fixedProjectId ?? projects[0]?.id ?? "");
  const [source, setSource] = useState<ImportSource>("roadmap");
  const [mode, setMode] = useState<ImportMode>("path");
  const [path, setPath] = useState("");
  const [contents, setContents] = useState("");
  const [repo, setRepo] = useState("");
  const [token, setToken] = useState("");
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
      if (source === "github") {
        const res = await api<{ imported: number }>(`/api/projects/${target}/suggestions`, {
          method: "POST",
          json: mode === "api"
            ? { source: "github", repo, token }
            : { source: "github", githubJson: contents },
        });
        setMsg(`Imported ${res.imported} suggestion${res.imported === 1 ? "" : "s"} into ${target}.`);
      } else {
        const json = mode === "path"
          ? { format: source, path }
          : source === "trello"
            ? { format: source, trelloJson: contents }
            : { format: source, roadmapHtml: contents };
        const res = await api<{ imported: number }>(`/api/projects/${target}/import`, {
          method: "POST",
          json,
        });
        setMsg(`Imported ${res.imported} item${res.imported === 1 ? "" : "s"} into ${target}.`);
      }
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
        <span className="field-label">Format</span>
        <div className="toolbar">
          {([
            ["roadmap", "roadmap.html"],
            ["trello", "Trello JSON"],
            ["github", "GitHub"],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={`btn btn-sm ${source === value ? "btn-primary" : ""}`}
              onClick={() => {
                setSource(value);
                setMode(value === "github" ? "paste" : "path");
                setMsg(null);
                setErr(null);
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <span className="field-label">Source</span>
        <div className="toolbar">
          {source !== "github" && (
            <button type="button" className={`btn btn-sm ${mode === "path" ? "btn-primary" : ""}`} onClick={() => setMode("path")}>
              From file path
            </button>
          )}
          <button type="button" className={`btn btn-sm ${mode === "paste" ? "btn-primary" : ""}`} onClick={() => setMode("paste")}>
            Paste
          </button>
          {source === "github" && (
            <button type="button" className={`btn btn-sm ${mode === "api" ? "btn-primary" : ""}`} onClick={() => setMode("api")}>
              GitHub API
            </button>
          )}
        </div>
      </div>

      {source === "github" && mode === "api" ? (
        <>
          <div>
            <label className="field-label" htmlFor="imp-repo">Repository</label>
            <input
              id="imp-repo"
              className="input"
              value={repo}
              placeholder="owner/repo"
              onChange={(e) => setRepo(e.target.value)}
            />
          </div>
          <div>
            <label className="field-label" htmlFor="imp-token">Token</label>
            <input
              id="imp-token"
              className="input"
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
          </div>
        </>
      ) : mode === "path" ? (
        <div>
          <label className="field-label" htmlFor="imp-path">Absolute path</label>
          <input
            id="imp-path"
            className="input"
            value={path}
            placeholder={source === "trello" ? "/Users/you/Downloads/trello-board.json" : "/Users/you/Dev/ideaclyst/plans/roadmap.html"}
            onChange={(e) => setPath(e.target.value)}
          />
        </div>
      ) : (
        <div>
          <label className="field-label" htmlFor="imp-contents">
            {source === "github" ? "GitHub JSON" : source === "trello" ? "Trello JSON" : "roadmap.html contents"}
          </label>
          <textarea
            id="imp-contents"
            className="textarea"
            style={{ minHeight: 160, fontFamily: "var(--font-mono)", fontSize: 12 }}
            value={contents}
            onChange={(e) => setContents(e.target.value)}
          />
        </div>
      )}

      {msg && <p style={{ color: "var(--teal)", fontSize: 13 }}>{msg}</p>}
      {err && <p style={{ color: "var(--rose)", fontSize: 13 }}>{err}</p>}

      <div className="toolbar">
        <button type="submit" className="btn btn-primary" disabled={busy || !target}>
          {busy ? "Importing…" : source === "github" ? "Import suggestions" : "Import items"}
        </button>
        <span className="muted" style={{ fontSize: 12.5 }}>
          Re-importing keeps stable source ids.
        </span>
      </div>
    </form>
  );
}
