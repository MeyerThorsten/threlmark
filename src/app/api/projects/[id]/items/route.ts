import { badRequest, created, notFound, ok, parseBody, serverError } from "@/lib/api";
import { createItem, listItemViews } from "@/lib/items/store";
import { getProject } from "@/lib/projects/store";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    if (!(await getProject(id))) return notFound(`Project not found: ${id}`);
    return ok(await listItemViews(id));
  } catch (err) {
    return serverError(err);
  }
}

export async function POST(req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    if (!(await getProject(id))) return notFound(`Project not found: ${id}`);
    const body = await parseBody<{ title?: string } & Record<string, unknown>>(req);
    if (!body.title || !String(body.title).trim()) return badRequest("title is required");
    const item = await createItem(id, body as Parameters<typeof createItem>[1]);
    return created(item);
  } catch (err) {
    if (err instanceof SyntaxError) return badRequest("Invalid JSON body");
    return serverError(err);
  }
}
