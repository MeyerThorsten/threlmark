"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/client";
import type { SearchResult } from "@/lib/search";

type NavAction = { id: string; title: string; hint: string; url: string };

type Row =
  | { kind: "action"; action: NavAction }
  | { kind: "result"; result: SearchResult };

const TYPE_GLYPH: Record<SearchResult["type"], string> = {
  item: "▢",
  suggestion: "✉",
  decision: "◆",
  outcome: "✓",
};

export function CommandPalette({
  projects,
}: {
  projects: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const seq = useRef(0);

  const actions: NavAction[] = useMemo(
    () => [
      { id: "portfolio", title: "Portfolio", hint: "view", url: "/" },
      { id: "insights", title: "Insights", hint: "view", url: "/insights" },
      { id: "plan", title: "Plan my day", hint: "view", url: "/plan" },
      { id: "shared", title: "Shared items", hint: "view", url: "/shared" },
      { id: "new-project", title: "New project", hint: "create", url: "/projects/new" },
      ...projects.map((p) => ({
        id: `p-${p.id}`,
        title: p.name,
        hint: "project",
        url: `/projects/${p.id}`,
      })),
    ],
    [projects],
  );

  // ⌘K / Ctrl+K toggles; Escape closes. Reset happens here, in the event
  // handler, so no effect needs a synchronous setState.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => {
          if (!o) {
            setQ("");
            setResults([]);
            setActive(0);
          }
          return !o;
        });
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [open]);

  // Debounced content search.
  useEffect(() => {
    if (!open) return;
    const query = q.trim();
    const mySeq = ++seq.current;
    const t = setTimeout(
      async () => {
        if (query.length < 2) {
          if (seq.current === mySeq) setResults([]);
          return;
        }
        try {
          const res = await api<{ results: SearchResult[] }>(
            `/api/search?q=${encodeURIComponent(query)}&limit=12`,
          );
          if (seq.current === mySeq) setResults(res.results);
        } catch {
          /* ignore */
        }
      },
      query.length < 2 ? 0 : 160,
    );
    return () => clearTimeout(t);
  }, [q, open]);

  const rows: Row[] = useMemo(() => {
    const query = q.trim().toLowerCase();
    const matched = query
      ? actions.filter((a) => a.title.toLowerCase().includes(query))
      : actions.slice(0, 6);
    return [
      ...matched.slice(0, 5).map((action) => ({ kind: "action" as const, action })),
      ...results.map((result) => ({ kind: "result" as const, result })),
    ];
  }, [q, actions, results]);

  // Clamp at use-time instead of via an effect (rows shrink as results change).
  const activeIdx = Math.min(active, Math.max(0, rows.length - 1));

  const go = useCallback(
    (row: Row) => {
      setOpen(false);
      router.push(row.kind === "action" ? row.action.url : row.result.url);
    },
    [router],
  );

  if (!open) return null;

  return (
    <div className="palette-backdrop" onClick={() => setOpen(false)}>
      <div
        className="palette panel"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          className="palette-input"
          placeholder="Jump to a project, or search items, decisions, outcomes…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive(Math.min(rows.length - 1, activeIdx + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive(Math.max(0, activeIdx - 1));
            } else if (e.key === "Enter" && rows[activeIdx]) {
              e.preventDefault();
              go(rows[activeIdx]);
            }
          }}
          aria-label="Search"
        />
        <div className="palette-rows">
          {rows.length === 0 && (
            <p className="muted" style={{ fontSize: 13, padding: "10px 14px", margin: 0 }}>
              {q.trim().length >= 2 ? "No matches." : "Type to search across every project."}
            </p>
          )}
          {rows.map((row, i) => (
            <button
              key={row.kind === "action" ? row.action.id : `${row.result.type}-${row.result.projectId}-${row.result.itemId ?? row.result.suggestionId}-${i}`}
              type="button"
              className={`palette-row ${i === activeIdx ? "active" : ""}`}
              onMouseEnter={() => setActive(i)}
              onClick={() => go(row)}
            >
              {row.kind === "action" ? (
                <>
                  <span className="glyph">→</span>
                  <span className="title">{row.action.title}</span>
                  <span className="hint">{row.action.hint}</span>
                </>
              ) : (
                <>
                  <span className="glyph">{TYPE_GLYPH[row.result.type]}</span>
                  <span className="title">
                    {row.result.title}
                    {row.result.snippet && <span className="snippet"> — {row.result.snippet}</span>}
                  </span>
                  <span className="hint">
                    {row.result.type} · {row.result.projectName}
                  </span>
                </>
              )}
            </button>
          ))}
        </div>
        <div className="palette-foot">
          <span>↑↓ navigate · ↵ open · esc close</span>
          <span className="readout">⌘K</span>
        </div>
      </div>
    </div>
  );
}
