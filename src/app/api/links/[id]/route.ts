import { ok, serverError } from "@/lib/api";
import { deleteLink } from "@/lib/links/store";

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    await deleteLink(id);
    return ok({ ok: true });
  } catch (err) {
    return serverError(err);
  }
}
