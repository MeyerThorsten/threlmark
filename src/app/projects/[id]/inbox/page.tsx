import { notFound } from "next/navigation";
import { InboxList } from "@/components/inbox-list";
import { ProjectNav } from "@/components/project-nav";
import { listProjects, getProject } from "@/lib/projects/store";
import { listSuggestions } from "@/lib/suggestions/store";

export const dynamic = "force-dynamic";

export default async function InboxPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) notFound();

  const [suggestions, projects] = await Promise.all([
    listSuggestions(id),
    listProjects(),
  ]);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-kicker" style={{ color: project.color || "var(--ember)" }}>
            {project.name}
          </div>
          <h1 className="page-title">Inbox</h1>
          <p className="page-desc">
            Suggestions dropped by other tools. Accept to turn one into a roadmap item, or
            promote it into another project.
          </p>
        </div>
      </div>
      <ProjectNav id={id} inbox={suggestions.length} />
      <InboxList
        projectId={id}
        initial={suggestions}
        projects={projects.map((p) => ({ id: p.id, name: p.name }))}
      />
    </>
  );
}
