import { notFound } from "next/navigation";
import Link from "next/link";
import { DevelopAllButton } from "@/components/develop-all-button";
import { ProjectNav } from "@/components/project-nav";
import { RemoveProjectButton } from "@/components/remove-project-button";
import { RoadmapWorkspace } from "@/components/roadmap-workspace";
import { getBoard } from "@/lib/board/store";
import { listItemViews } from "@/lib/items/store";
import { getProject, listProjects } from "@/lib/projects/store";
import { countSuggestions } from "@/lib/suggestions/store";

export const dynamic = "force-dynamic";

export default async function ProjectBoardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) notFound();

  const [items, board, inbox, allProjects] = await Promise.all([
    listItemViews(id),
    getBoard(id),
    countSuggestions(id),
    listProjects(),
  ]);
  const otherProjects = allProjects.filter((p) => p.id !== id).map((p) => ({ id: p.id, name: p.name }));

  const metrics = {
    total: items.length,
    development: items.filter((i) => i.status === "development").length,
    ranked: items.filter((i) => i.status === "ranked").length,
    done: items.filter((i) => i.status === "done").length,
  };

  return (
    <>
      <header className="page-head">
        <div>
          <div className="page-kicker" style={{ color: project.color || "var(--ember)" }}>
            Project roadmap
          </div>
          <h1 className="page-title" style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <span className="dot" style={{ width: 14, height: 14, borderRadius: "50%", background: project.color || "var(--ember)" }} />
            {project.name}
          </h1>
          {project.description && <p className="page-desc">{project.description}</p>}
          <div className="toolbar" style={{ marginTop: 14 }}>
            <DevelopAllButton projectId={id} devCount={metrics.development} />
            <Link href={`/projects/${id}/handoff`} className="btn btn-sm">⇥ Handoff brief</Link>
            <Link href={`/projects/${id}/import`} className="btn btn-sm">↧ Import</Link>
            <RemoveProjectButton projectId={id} projectName={project.name} />
          </div>
        </div>
        <aside className="summary-card panel" aria-label="Roadmap summary" style={{ minWidth: 300 }}>
          <div className="summary-grid">
            <div className="metric"><strong>{metrics.total}</strong><span>Total items</span></div>
            <div className="metric"><strong>{metrics.development}</strong><span>In development</span></div>
            <div className="metric"><strong>{metrics.ranked}</strong><span>Ranked backlog</span></div>
            <div className="metric"><strong>{metrics.done}</strong><span>Done</span></div>
          </div>
        </aside>
      </header>

      <ProjectNav id={id} inbox={inbox} />
      <RoadmapWorkspace
        projectId={id}
        projectName={project.name}
        repoPath={project.repoPath}
        initialItems={items}
        initialBoard={board}
        otherProjects={otherProjects}
        wipLimits={project.wipLimits ?? {}}
        lanePolicies={project.lanePolicies ?? {}}
        projectCategories={project.categories}
        initialSavedViews={project.savedViews ?? []}
      />
    </>
  );
}
