import { notFound } from "next/navigation";
import { FlowPanel } from "@/components/flow-panel";
import { ProjectNav } from "@/components/project-nav";
import { projectFlow } from "@/lib/metrics";
import { getProject } from "@/lib/projects/store";
import { countSuggestions } from "@/lib/suggestions/store";

export const dynamic = "force-dynamic";

export default async function FlowPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) notFound();

  const [flow, inbox] = await Promise.all([projectFlow(id), countSuggestions(id)]);
  if (!flow) notFound();

  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-kicker" style={{ color: project.color || "var(--ember)" }}>{project.name}</div>
          <h1 className="page-title">Flow</h1>
          <p className="page-desc">
            WIP, throughput, cycle time and aging — plus how your agents are clearing handed-off work.
          </p>
        </div>
      </div>
      <ProjectNav id={id} inbox={inbox} />
      <FlowPanel flow={flow} wipLimits={flow.wipLimits} />
    </>
  );
}
