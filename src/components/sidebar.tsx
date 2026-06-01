"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { ThemeToggle } from "./theme-toggle";

type NavProject = {
  id: string;
  name: string;
  color?: string;
  items: number;
  inbox: number;
};

export function Sidebar({ projects }: { projects: NavProject[] }) {
  const pathname = usePathname();
  const router = useRouter();
  const [removingId, setRemovingId] = useState<string | null>(null);

  async function removeProject(project: NavProject) {
    if (removingId) return;
    const confirmed = window.confirm(
      `Remove "${project.name}" from the list?\n\nIt is archived (not deleted) — its data stays on disk and you can restore it later.`,
    );
    if (!confirmed) return;
    setRemovingId(project.id);
    try {
      const res = await fetch(`/api/projects/${project.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`Archive failed (${res.status})`);
      if (pathname.startsWith(`/projects/${project.id}`)) {
        router.push("/");
      } else {
        router.refresh();
      }
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Could not remove project");
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <aside className="sidebar">
      <Link href="/" className="brand" aria-label="Threlmark home">
        <svg className="brand-mark" viewBox="0 0 32 32" fill="none" aria-hidden>
          <circle cx="16" cy="16" r="14" stroke="currentColor" strokeWidth="1.5" opacity="0.5" />
          <path d="M16 5 L25 22 H7 Z" stroke="currentColor" strokeWidth="1.6" fill="none" />
          <circle cx="16" cy="17" r="2.6" fill="currentColor" />
          <path d="M16 1.5V5M16 27v3.5M1.5 16H5M27 16h3.5" stroke="currentColor" strokeWidth="1.5" />
        </svg>
        <span>
          <span className="brand-name">Threlmark</span>
          <br />
          <span className="brand-sub">command deck</span>
        </span>
      </Link>

      <Link href="/" className={`nav-link ${pathname === "/" ? "active" : ""}`}>
        <span>◇ Portfolio</span>
      </Link>
      <Link
        href="/import"
        className={`nav-link ${pathname === "/import" ? "active" : ""}`}
      >
        <span>↧ Import roadmap</span>
      </Link>
      <Link
        href="/shared"
        className={`nav-link ${pathname === "/shared" ? "active" : ""}`}
      >
        <span>⊞ Shared items</span>
      </Link>

      <div className="nav-label">Projects · {projects.length}</div>
      {projects.length === 0 && (
        <span className="nav-link muted" style={{ cursor: "default" }}>
          No projects yet
        </span>
      )}
      {projects.map((p) => {
        const active = pathname.startsWith(`/projects/${p.id}`);
        const removing = removingId === p.id;
        return (
          <div key={p.id} className={`nav-row ${removing ? "removing" : ""}`}>
            <Link
              href={`/projects/${p.id}`}
              className={`nav-link ${active ? "active" : ""}`}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                <span
                  className="dot"
                  style={{ background: p.color || "var(--ember)" }}
                />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {p.name}
                </span>
              </span>
              <span className="count">
                {p.inbox > 0 && (
                  <span style={{ color: "var(--teal)" }} title={`${p.inbox} in inbox`}>
                    ●{p.inbox}{" "}
                  </span>
                )}
                {p.items}
              </span>
            </Link>
            <button
              type="button"
              className="nav-remove"
              title={`Remove ${p.name} from the list (archives it)`}
              aria-label={`Remove ${p.name} from the list`}
              disabled={removing}
              onClick={() => removeProject(p)}
            >
              {removing ? "…" : "×"}
            </button>
          </div>
        );
      })}

      <div className="spacer" />
      <div className="sidebar-actions">
        <ThemeToggle />
        <Link href="/projects/new" className="btn btn-sm" style={{ justifyContent: "center", flex: 1 }}>
          + New project
        </Link>
      </div>
    </aside>
  );
}
