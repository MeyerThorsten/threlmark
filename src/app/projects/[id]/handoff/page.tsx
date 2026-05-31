import { notFound } from "next/navigation";
import { HandoffPanel } from "@/components/handoff-panel";
import { ProjectNav } from "@/components/project-nav";
import { listItemViews } from "@/lib/items/store";
import { getProject } from "@/lib/projects/store";
import { countSuggestions } from "@/lib/suggestions/store";

export const dynamic = "force-dynamic";

export default async function HandoffPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) notFound();

  const [items, inbox] = await Promise.all([listItemViews(id), countSuggestions(id)]);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-kicker" style={{ color: project.color || "var(--ember)" }}>
            {project.name}
          </div>
          <h1 className="page-title">Handoff brief</h1>
          <p className="page-desc">
            Export selected items as a file-scoped Claude/Codex implementation prompt — with
            acceptance criteria and verification commands — or as queue text or JSON.
          </p>
        </div>
      </div>
      <ProjectNav id={id} inbox={inbox} />
      <HandoffPanel projectId={id} items={items} />
    </>
  );
}
