import { ok, serverError } from "@/lib/api";
import { listHandoffs } from "@/lib/handoff/records";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    return ok(await listHandoffs(id));
  } catch (err) {
    return serverError(err);
  }
}
