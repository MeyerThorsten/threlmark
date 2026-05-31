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
          <h1 className="page-title">Seed a project from roadmap.html</h1>
          <p className="page-desc">
            Reads the original kanban&apos;s <code style={{ fontFamily: "var(--font-mono)", fontSize: 12.5 }}>defaults</code>{" "}
            array and creates a roadmap item per card, scored identically.
          </p>
        </div>
      </div>
      <ImportForm projects={projects.map((p) => ({ id: p.id, name: p.name }))} />
    </>
  );
}
