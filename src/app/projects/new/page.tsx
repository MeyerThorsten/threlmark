"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";
import type { Project } from "@/lib/schema/types";

const SWATCHES = ["#e8893d", "#4fb6a8", "#d9b44a", "#6f8bba", "#d96b7c", "#5aa987"];

export default function NewProjectPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [repoPath, setRepoPath] = useState("");
  const [color, setColor] = useState(SWATCHES[0]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const project = await api<Project>("/api/projects", {
        method: "POST",
        json: { name, description, repoPath, color },
      });
      router.push(`/projects/${project.id}`);
      router.refresh();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Failed to create project");
      setBusy(false);
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-kicker">New project</div>
          <h1 className="page-title">Chart a new project</h1>
          <p className="page-desc">
            Each project gets its own ranked kanban roadmap. Its data lives on disk under{" "}
            <code style={{ fontFamily: "var(--font-mono)", fontSize: 12.5 }}>
              ~/.threlmark/projects/&lt;id&gt;/
            </code>{" "}
            so your other tools can read and write it.
          </p>
        </div>
      </div>

      <form className="panel" style={{ maxWidth: 560, padding: 24, display: "flex", flexDirection: "column", gap: 16 }} onSubmit={submit}>
        <div>
          <label className="field-label" htmlFor="np-name">Name</label>
          <input
            id="np-name"
            className="input"
            value={name}
            autoFocus
            placeholder="IdeaClyst"
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div>
          <label className="field-label" htmlFor="np-desc">Description</label>
          <textarea
            id="np-desc"
            className="textarea"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div>
          <label className="field-label" htmlFor="np-repo">Repo path (optional, for handoff scoping)</label>
          <input
            id="np-repo"
            className="input"
            value={repoPath}
            placeholder="/Users/you/Dev/ideaclyst"
            onChange={(e) => setRepoPath(e.target.value)}
          />
        </div>
        <div>
          <span className="field-label">Accent</span>
          <div style={{ display: "flex", gap: 8 }}>
            {SWATCHES.map((c) => (
              <button
                type="button"
                key={c}
                onClick={() => setColor(c)}
                aria-label={`Accent ${c}`}
                aria-pressed={color === c}
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: "50%",
                  background: c,
                  border: color === c ? "2px solid var(--text-strong)" : "2px solid transparent",
                  cursor: "pointer",
                }}
              />
            ))}
          </div>
        </div>
        {err && <p style={{ color: "var(--rose)", fontSize: 13 }}>{err}</p>}
        <div className="toolbar">
          <button type="submit" className="btn btn-primary" disabled={busy || !name.trim()}>
            {busy ? "Creating…" : "Create project"}
          </button>
        </div>
      </form>
    </>
  );
}
