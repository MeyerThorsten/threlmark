import { badRequest, created, notFound, parseBody, serverError } from "@/lib/api";
import { attachSharedToProject } from "@/lib/shared/store";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const body = await parseBody<{ projectId?: string; itemId?: string }>(req);
    if (!body.projectId) return badRequest("projectId is required");
    const item = await attachSharedToProject(id, body.projectId, body.itemId);
    return created(item);
  } catch (err) {
    if (err instanceof SyntaxError) return badRequest("Invalid JSON body");
    if (err instanceof Error && /not found/i.test(err.message)) return notFound(err.message);
    return serverError(err);
  }
}
