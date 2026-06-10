"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function ProjectNav({ id, inbox }: { id: string; inbox: number }) {
  const pathname = usePathname();
  const base = `/projects/${id}`;
  const tabs = [
    { href: base, label: "Board" },
    { href: `${base}/flow`, label: "Flow" },
    { href: `${base}/insights`, label: "Insights" },
    { href: `${base}/inbox`, label: inbox > 0 ? `Inbox · ${inbox}` : "Inbox" },
    { href: `${base}/handoff`, label: "Handoff" },
  ];
  return (
    <nav className="subnav" aria-label="Project views">
      {tabs.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={`subnav-tab ${pathname === t.href ? "active" : ""}`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
