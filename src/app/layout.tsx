import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/sidebar";
import { listProjects } from "@/lib/projects/store";
import { listItems } from "@/lib/items/io";
import { countSuggestions } from "@/lib/suggestions/store";

// Self-contained font stack (no Google Fonts fetch at build time) — the font
// families are defined in globals.css with system fallbacks, so the app builds
// and runs fully offline. DSGVO-clean and resilient to network issues.

export const metadata: Metadata = {
  title: "Threlmark — project & roadmap command deck",
  description: "A local-first hub for all your projects and their ranked roadmaps.",
};

export const dynamic = "force-dynamic";

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const projects = await listProjects();
  const nav = await Promise.all(
    projects.map(async (p) => ({
      id: p.id,
      name: p.name,
      color: p.color,
      items: (await listItems(p.id)).length,
      inbox: await countSuggestions(p.id),
    })),
  );

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var t=localStorage.getItem('threlmark-theme');document.documentElement.dataset.theme=t==='dark'?'dark':'light'}catch(e){document.documentElement.dataset.theme='light'}",
          }}
        />
      </head>
      <body>
        <div className="shell">
          <Sidebar projects={nav} />
          <div className="main-col">
            <main className="main">{children}</main>
            <footer className="app-footer">
              © 2026 Threlmark · Thorsten Meyer · Powered by{" "}
              <a href="https://thorstenmeyerai.com/" target="_blank" rel="noopener noreferrer">
                Thorsten Meyer AI
              </a>
            </footer>
          </div>
        </div>
      </body>
    </html>
  );
}
