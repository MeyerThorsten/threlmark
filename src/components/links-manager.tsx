"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";
import { LINK_KINDS, type Link } from "@/lib/schema/types";

export type ItemRef = { address: string; label: string };

const KIND_GLYPH: Record<string, string> = {
  blocks: "⛔ blocks",
  relates: "↔ relates to",
  duplicates: "⊞ duplicates",
};

export function LinksManager({
  itemRefs,
  initialLinks,
}: {
  itemRefs: ItemRef[];
  initialLinks: Link[];
}) {
  const router = useRouter();
  const [links, setLinks] = useState<Link[]>(initialLinks);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [kind, setKind] = useState<string>("blocks");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const labelFor = (address: string) =>
    itemRefs.find((r) => r.address === address)?.label ?? address;

  async function create() {
    if (!from || !to || from === to) {
      setErr("Pick two different items");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const link = await api<Link>("/api/links", { method: "POST", json: { from, to, kind } });
      setLinks((l) => [...l, link]);
      setFrom("");
      setTo("");
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to create link");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setLinks((l) => l.filter((x) => x.id !== id));
    await api(`/api/links/${id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className="panel" style={{ padding: 18 }}>
      <h3 style={{ fontSize: 16, marginBottom: 12 }}>Cross-project dependencies</h3>

      <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr auto", gap: 8, alignItems: "end" }}>
        <div>
          <label className="field-label" htmlFor="lk-from">From</label>
          <select id="lk-from" className="select" value={from} onChange={(e) => setFrom(e.target.value)}>
            <option value="">Select item…</option>
            {itemRefs.map((r) => (
              <option key={r.address} value={r.address}>{r.label}</option>
            ))}
          </select>
        </div>
        <select className="select" style={{ width: 130 }} value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Link kind">
          {LINK_KINDS.map((k) => (
            <option key={k} value={k}>{k}</option>
          ))}
        </select>
        <div>
          <label className="field-label" htmlFor="lk-to">To</label>
          <select id="lk-to" className="select" value={to} onChange={(e) => setTo(e.target.value)}>
            <option value="">Select item…</option>
            {itemRefs.map((r) => (
              <option key={r.address} value={r.address}>{r.label}</option>
            ))}
          </select>
        </div>
        <button className="btn btn-primary" disabled={busy} onClick={create}>Link</button>
      </div>
      {err && <p style={{ color: "var(--rose)", fontSize: 13, marginTop: 8 }}>{err}</p>}

      <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 8 }}>
        {links.length === 0 ? (
          <p className="muted" style={{ fontSize: 13 }}>No cross-project links yet.</p>
        ) : (
          links.map((l) => (
            <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13.5 }}>
              <span style={{ color: "var(--text-strong)" }}>{labelFor(l.from)}</span>
              <span className="chip" style={{ borderColor: l.kind === "blocks" ? "var(--rose)" : "var(--border-bright)", color: l.kind === "blocks" ? "var(--rose)" : "var(--muted)" }}>
                {KIND_GLYPH[l.kind] ?? l.kind}
              </span>
              <span style={{ color: "var(--text-strong)" }}>{labelFor(l.to)}</span>
              <div className="spacer" />
              <button className="btn btn-ghost btn-sm" onClick={() => remove(l.id)} aria-label="Delete link">✕</button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
