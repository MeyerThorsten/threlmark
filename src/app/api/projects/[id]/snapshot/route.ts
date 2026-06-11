import { notFound, serverError } from "@/lib/api";
import { listItemViews } from "@/lib/items/store";
import { getProject } from "@/lib/projects/store";
import { renderSnapshotHtml } from "@/lib/snapshot";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const project = await getProject(id);
    if (!project) return notFound(`Project not found: ${id}`);
    const items = await listItemViews(id);
    const html = renderSnapshotHtml(project, items);
    const headers: Record<string, string> = { "Content-Type": "text/html; charset=utf-8" };
    if (new URL(req.url).searchParams.get("download") === "1") {
      headers["Content-Disposition"] =
        `attachment; filename="${project.slug || id}-roadmap-${new Date().toISOString().slice(0, 10)}.html"`;
    }
    return new Response(html, { headers });
  } catch (err) {
    return serverError(err);
  }
}
