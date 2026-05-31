import { badRequest, notFound, ok, parseBody, serverError } from "@/lib/api";
import { recordReport } from "@/lib/reports/store";

type Ctx = { params: Promise<{ id: string; itemId: string }> };

/** Agents POST here to report status/result; a `done` report auto-moves to Done. */
export async function POST(req: Request, { params }: Ctx) {
  try {
    const { id, itemId } = await params;
    const body = await parseBody<{
      agent?: string;
      status?: string;
      summary?: string;
      verification?: string;
    }>(req);
    const item = await recordReport(id, itemId, {
      agent: body.agent ?? "other",
      status: body.status ?? "started",
      summary: body.summary,
      verification: body.verification,
    });
    return item ? ok(item) : notFound(`Item not found: ${id}/${itemId}`);
  } catch (err) {
    if (err instanceof SyntaxError) return badRequest("Invalid JSON body");
    return serverError(err);
  }
}
