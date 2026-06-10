import { notFound, ok, serverError } from "@/lib/api";
import { projectInsights } from "@/lib/insights";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const insights = await projectInsights(id);
    return insights ? ok(insights) : notFound(`Project not found: ${id}`);
  } catch (err) {
    return serverError(err);
  }
}
