import { ok, serverError } from "@/lib/api";
import { listSuggestions } from "@/lib/suggestions/store";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    return ok(await listSuggestions(id));
  } catch (err) {
    return serverError(err);
  }
}
