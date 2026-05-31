import { badRequest, created, ok, parseBody, serverError } from "@/lib/api";
import { shareItem } from "@/lib/crossproject";
import { listSharedItems } from "@/lib/shared/store";

export async function GET() {
  try {
    return ok(await listSharedItems());
  } catch (err) {
    return serverError(err);
  }
}

export async function POST(req: Request) {
  try {
    const body = await parseBody<{
      title?: string;
      description?: string;
      category?: string;
      fromItems?: string[];
    }>(req);
    if (!body.title || !body.title.trim()) return badRequest("title is required");
    const result = await shareItem({
      title: body.title,
      description: body.description,
      category: body.category,
      fromItems: Array.isArray(body.fromItems) ? body.fromItems : [],
    });
    return created(result);
  } catch (err) {
    if (err instanceof SyntaxError) return badRequest("Invalid JSON body");
    return serverError(err);
  }
}
