import { badRequest, created, ok, parseBody, serverError } from "@/lib/api";
import { linkItems } from "@/lib/crossproject";
import { listLinks } from "@/lib/links/store";

export async function GET() {
  try {
    return ok(await listLinks());
  } catch (err) {
    return serverError(err);
  }
}

export async function POST(req: Request) {
  try {
    const body = await parseBody<{ from?: string; to?: string; kind?: string; note?: string }>(req);
    if (!body.from || !body.to) return badRequest("from and to (global addresses) are required");
    const link = await linkItems({ from: body.from, to: body.to, kind: body.kind, note: body.note });
    return created(link);
  } catch (err) {
    if (err instanceof SyntaxError) return badRequest("Invalid JSON body");
    return serverError(err);
  }
}
