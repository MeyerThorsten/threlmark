import { notFound, ok, serverError } from "@/lib/api";
import { projectFlow } from "@/lib/metrics";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const flow = await projectFlow(id);
    return flow ? ok(flow) : notFound(`Project not found: ${id}`);
  } catch (err) {
    return serverError(err);
  }
}
