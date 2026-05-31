import { ok, serverError } from "@/lib/api";
import { dismissSuggestion } from "@/lib/suggestions/store";

type Ctx = { params: Promise<{ id: string; sugId: string }> };

export async function POST(_req: Request, { params }: Ctx) {
  try {
    const { id, sugId } = await params;
    await dismissSuggestion(id, sugId);
    return ok({ ok: true });
  } catch (err) {
    return serverError(err);
  }
}
