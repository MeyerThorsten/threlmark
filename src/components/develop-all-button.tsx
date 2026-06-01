"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { AGENTS, type Agent } from "@/lib/schema/types";

/**
 * One-click handoff of every item in the Development lane to Claude or Codex.
 * Generates a single file-scoped brief (with the auto-report protocol), records
 * the handoff for brief → shipped tracking, and copies the brief to the
 * clipboard. The handoff API defaults to the Development lane when no itemIds
 * are given, so this hands off exactly what the board shows in Development.
 */
export function DevelopAllButton({
  projectId,
  devCount,
}: {
  projectId: string;
  devCount: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [agent, setAgent] = useState<Agent>("claude");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ count: number; content: string; copied: boolean } | null>(
    null,
  );

  function openDialog() {
    setError(null);
    setResult(null);
    setOpen(true);
  }

  async function handOff() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ content: string; count: number; recorded?: { count: number } }>(
        `/api/projects/${projectId}/handoff`,
        {
          method: "POST",
          json: { format: "markdown", record: true, agent, moveToDevelopment: false },
        },
      );
      let copied = false;
      try {
        await navigator.clipboard.writeText(res.content);
        copied = true;
      } catch {
        /* clipboard may be blocked without focus — the brief is still shown below */
      }
      setResult({ count: res.recorded?.count ?? res.count, content: res.content, copied });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not hand off the Development items");
    } finally {
      setBusy(false);
    }
  }

  async function copyAgain() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.content);
      setResult({ ...result, copied: true });
    } catch {
      /* ignore */
    }
  }

  function download() {
    if (!result) return;
    const blob = new Blob([result.content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${projectId}-develop-all.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <button
        type="button"
        className="btn btn-sm btn-teal"
        disabled={devCount === 0}
        title={
          devCount === 0
            ? "No items in Development to hand off"
            : `Hand off all ${devCount} Development item(s) to an agent`
        }
        onClick={openDialog}
      >
        ⇥ Develop all{devCount > 0 ? ` (${devCount})` : ""}
      </button>

      {open && (
        <div className="modal-backdrop" onClick={() => !busy && setOpen(false)} role="presentation">
          <div
            className="modal-card"
            style={{ maxWidth: result ? 640 : 460 }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="develop-all-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="develop-all-title">Hand off all Development items</h2>

            {!result ? (
              <div className="modal-body">
                <p style={{ margin: "0 0 12px" }}>
                  Send all <strong>{devCount}</strong> item(s) in <strong>Development</strong> to an
                  agent as one brief. This generates a file-scoped Claude/Codex prompt — with
                  acceptance criteria, verification commands and the auto-report protocol — records
                  the handoff (for <em>brief → shipped</em> tracking), and copies the brief to your
                  clipboard.
                </p>
                <span className="field-label" style={{ marginBottom: 6 }}>Hand off to</span>
                <div className="toolbar" style={{ gap: 6 }}>
                  {AGENTS.filter((a) => a === "claude" || a === "codex").map((a) => (
                    <button
                      key={a}
                      type="button"
                      className={`btn btn-sm ${agent === a ? "btn-primary" : ""}`}
                      onClick={() => setAgent(a)}
                    >
                      {a}
                    </button>
                  ))}
                </div>
                {error && (
                  <p style={{ margin: "12px 0 0", color: "var(--rose)", fontSize: 13 }}>{error}</p>
                )}
              </div>
            ) : (
              <div className="modal-body">
                <p style={{ margin: "0 0 10px", color: "var(--teal)" }}>
                  ✓ Handed off <strong>{result.count}</strong> item(s) to <strong>{agent}</strong>.{" "}
                  {result.copied
                    ? "The brief is copied to your clipboard — paste it into the agent."
                    : "Copy the brief below and paste it into the agent."}
                </p>
                <pre className="codeblock" style={{ maxHeight: 280, overflow: "auto" }}>
                  {result.content}
                </pre>
              </div>
            )}

            <div className="modal-actions">
              {!result ? (
                <>
                  <button type="button" className="btn btn-sm" disabled={busy} onClick={() => setOpen(false)}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-teal"
                    disabled={busy || devCount === 0}
                    onClick={handOff}
                  >
                    {busy ? "Handing off…" : `Hand off ${devCount} to ${agent}`}
                  </button>
                </>
              ) : (
                <>
                  <button type="button" className="btn btn-sm" onClick={download}>
                    Download .md
                  </button>
                  <button type="button" className="btn btn-sm" onClick={copyAgain}>
                    {result.copied ? "Copied ✓" : "Copy brief"}
                  </button>
                  <button type="button" className="btn btn-sm btn-primary" onClick={() => setOpen(false)}>
                    Done
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
