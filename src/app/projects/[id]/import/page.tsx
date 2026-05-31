import { notFound } from "next/navigation";
import { ImportForm } from "@/components/import-form";
import { ProjectNav } from "@/components/project-nav";
import { getProject } from "@/lib/projects/store";
import { countSuggestions } from "@/lib/suggestions/store";

export const dynamic = "force-dynamic";

export default async function ProjectImportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) notFound();
  const inbox = await countSuggestions(id);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-kicker">{project.name}</div>
          <h1 className="page-title">Import into {project.name}</h1>
        </div>
      </div>
      <ProjectNav id={id} inbox={inbox} />
      <ImportForm projects={[{ id, name: project.name }]} fixedProjectId={id} />
    </>
  );
}
