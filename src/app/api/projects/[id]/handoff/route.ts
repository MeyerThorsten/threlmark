import { badRequest, notFound, ok, parseBody, serverError } from "@/lib/api";
import { generateHandoff, type HandoffFormat } from "@/lib/handoff/generate";
import { recordHandoff } from "@/lib/handoff/records";
import { listItemViews } from "@/lib/items/store";
import { reportsDir } from "@/lib/paths";
import { getProject } from "@/lib/projects/store";

type Ctx = { params: Promise<{ id: string }> };
const FORMATS: HandoffFormat[] = ["markdown", "text", "json"];

export async function POST(req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const project = await getProject(id);
    if (!project) return notFound(`Project not found: ${id}`);

    const body = await parseBody<{
      itemIds?: string[];
      format?: string;
      record?: boolean;
      agent?: string;
      moveToDevelopment?: boolean;
    }>(req);
    const format = (FORMATS.includes(body.format as HandoffFormat) ? body.format : "markdown") as HandoffFormat;

    const all = await listItemViews(id);
    const selected =
      Array.isArray(body.itemIds) && body.itemIds.length
        ? all.filter((i) => body.itemIds!.includes(i.id))
        : all.filter((i) => i.status === "development");

    const origin = (() => {
      try {
        return new URL(req.url).origin;
      } catch {
        return undefined;
      }
    })();
    const content = generateHandoff(project, selected, format, {
      baseUrl: origin,
      projectId: id,
      agent: body.agent,
      reportsDir: reportsDir(id),
    });

    let recorded: { handoffId: string; count: number } | undefined;
    if (body.record && selected.length) {
      const rec = await recordHandoff(id, {
        agent: body.agent ?? "other",
        format,
        itemIds: selected.map((i) => i.id),
        moveToDevelopment: body.moveToDevelopment,
      });
      recorded = { handoffId: rec.id, count: selected.length };
    }

    return ok({ format, count: selected.length, content, recorded });
  } catch (err) {
    if (err instanceof SyntaxError) return badRequest("Invalid JSON body");
    return serverError(err);
  }
}
