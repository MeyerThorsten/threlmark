import { badRequest, created, notFound, parseBody, serverError } from "@/lib/api";
import { acceptSuggestion } from "@/lib/suggestions/store";

type Ctx = { params: Promise<{ id: string; sugId: string }> };

export async function POST(req: Request, { params }: Ctx) {
  try {
    const { id, sugId } = await params;
    const body = await parseBody<{ targetProjectId?: string }>(req);
    const item = await acceptSuggestion(id, sugId, body.targetProjectId);
    return created(item);
  } catch (err) {
    if (err instanceof SyntaxError) return badRequest("Invalid JSON body");
    if (err instanceof Error && err.message.startsWith("Suggestion not found")) {
      return notFound(err.message);
    }
    return serverError(err);
  }
}
