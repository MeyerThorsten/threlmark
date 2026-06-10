import { notFound } from "next/navigation";
import { InsightsPanel } from "@/components/insights-panel";
import { ProjectNav } from "@/components/project-nav";
import { projectInsights } from "@/lib/insights";
import { getProject } from "@/lib/projects/store";
import { countSuggestions } from "@/lib/suggestions/store";

export const dynamic = "force-dynamic";

export default async function InsightsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) notFound();

  const [insights, inbox] = await Promise.all([projectInsights(id), countSuggestions(id)]);
  if (!insights) notFound();

  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-kicker" style={{ color: project.color || "var(--ember)" }}>{project.name}</div>
          <h1 className="page-title">Insights</h1>
          <p className="page-desc">
            The decision layer: what&apos;s at risk, when the backlog will realistically drain,
            what was decided, and what shipping actually produced — all derived live from the board.
          </p>
        </div>
      </div>
      <ProjectNav id={id} inbox={inbox} />
      <InsightsPanel insights={insights} />
    </>
  );
}
