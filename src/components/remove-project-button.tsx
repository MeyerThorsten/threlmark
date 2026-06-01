"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";

/**
 * Deliberate, hard-to-trigger project removal. Opens a dialog that requires the
 * user to type the project's exact name before the destructive action enables.
 * Removal is non-destructive: the API archives the project (data stays on disk
 * under archive/), so nothing is ever lost.
 */
export function RemoveProjectButton({
  projectId,
  projectName,
}: {
  projectId: string;
  projectName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const confirmed = typed.trim() === projectName;

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, busy]);

  function openDialog() {
    setTyped("");
    setError(null);
    setOpen(true);
  }

  async function remove() {
    if (!confirmed || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/api/projects/${projectId}`, { method: "DELETE" });
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove project");
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="btn btn-sm btn-danger-ghost"
        title={`Remove ${projectName} (archives it — data is kept)`}
        onClick={openDialog}
      >
        ⌫ Remove project
      </button>

      {open && (
        <div
          className="modal-backdrop"
          onClick={() => !busy && setOpen(false)}
          role="presentation"
        >
          <div
            className="modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="remove-project-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="remove-project-title">Remove this project?</h2>
            <div className="modal-body">
              <p style={{ margin: "0 0 10px" }}>
                This <strong>archives</strong> the project — it leaves your active list but{" "}
                <strong>all data is kept locally on disk</strong> (under <code>archive/</code>),
                so nothing is lost and it can be restored later.
              </p>
              <p style={{ margin: "0 0 8px" }}>
                To confirm, type the project name{" "}
                <span className="modal-confirm-name">{projectName}</span> below:
              </p>
              <input
                ref={inputRef}
                className="input"
                value={typed}
                placeholder={projectName}
                disabled={busy}
                autoComplete="off"
                spellCheck={false}
                onChange={(e) => setTyped(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && confirmed) remove();
                }}
                aria-label={`Type ${projectName} to confirm`}
              />
              {error && (
                <p style={{ margin: "10px 0 0", color: "var(--rose)", fontSize: 13 }}>{error}</p>
              )}
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-sm"
                disabled={busy}
                onClick={() => setOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-sm btn-danger"
                disabled={!confirmed || busy}
                onClick={remove}
              >
                {busy ? "Removing…" : "Remove project"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
