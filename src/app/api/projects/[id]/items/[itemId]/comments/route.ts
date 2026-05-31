import { badRequest, created, notFound, ok, parseBody, serverError } from "@/lib/api";
import { createComment, listComments } from "@/lib/comments/store";
import { getItem } from "@/lib/items/store";

type Ctx = { params: Promise<{ id: string; itemId: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  try {
    const { id, itemId } = await params;
    if (!(await getItem(id, itemId))) return notFound(`Item not found: ${id}/${itemId}`);
    return ok(await listComments(id, itemId));
  } catch (err) {
    return serverError(err);
  }
}

export async function POST(req: Request, { params }: Ctx) {
  try {
    const { id, itemId } = await params;
    if (!(await getItem(id, itemId))) return notFound(`Item not found: ${id}/${itemId}`);
    const body = await parseBody<{ kind?: string; body?: string; author?: string }>(req);
    if (!body.body?.trim()) return badRequest("body is required");
    return created(await createComment(id, itemId, body));
  } catch (err) {
    if (err instanceof SyntaxError) return badRequest("Invalid JSON body");
    if (err instanceof Error) return badRequest(err.message);
    return serverError(err);
  }
}
