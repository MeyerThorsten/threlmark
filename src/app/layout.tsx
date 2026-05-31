import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/sidebar";
import { listProjects } from "@/lib/projects/store";
import { listItems } from "@/lib/items/io";
import { countSuggestions } from "@/lib/suggestions/store";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const mono = JetBrains_Mono({ variable: "--font-mono", subsets: ["latin"] });

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
    <html lang="en" className={`${inter.variable} ${mono.variable}`}>
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
