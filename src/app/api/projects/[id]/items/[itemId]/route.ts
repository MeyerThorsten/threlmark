import { badRequest, notFound, ok, parseBody, serverError } from "@/lib/api";
import { deleteItem, getItem, updateItem } from "@/lib/items/store";

type Ctx = { params: Promise<{ id: string; itemId: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  try {
    const { id, itemId } = await params;
    const item = await getItem(id, itemId);
    return item ? ok(item) : notFound(`Item not found: ${id}/${itemId}`);
  } catch (err) {
    return serverError(err);
  }
}

export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const { id, itemId } = await params;
    const body = await parseBody<Record<string, unknown>>(req);
    const item = await updateItem(id, itemId, body);
    return ok(item);
  } catch (err) {
    if (err instanceof SyntaxError) return badRequest("Invalid JSON body");
    if (err instanceof Error && err.message.startsWith("Item not found")) {
      return notFound(err.message);
    }
    return serverError(err);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const { id, itemId } = await params;
    await deleteItem(id, itemId);
    return ok({ ok: true });
  } catch (err) {
    return serverError(err);
  }
}
