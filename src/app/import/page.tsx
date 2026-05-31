import { ImportForm } from "@/components/import-form";
import { listProjects } from "@/lib/projects/store";

export const dynamic = "force-dynamic";

export default async function ImportPage() {
  const projects = await listProjects();
  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-kicker">Import</div>
          <h1 className="page-title">Import project work</h1>
          <p className="page-desc">
            Bring in roadmap.html cards, Trello board exports, or GitHub issues as project suggestions.
          </p>
        </div>
      </div>
      <ImportForm projects={projects.map((p) => ({ id: p.id, name: p.name }))} />
    </>
  );
}
