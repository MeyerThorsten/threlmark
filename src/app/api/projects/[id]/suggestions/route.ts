import { badRequest, ok, parseBody, serverError } from "@/lib/api";
import { importGitHubSuggestions } from "@/lib/importer/github";
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

export async function POST(req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const body = await parseBody<{ source?: string; githubJson?: string; repo?: string; token?: string }>(req);
    if (body.source && body.source !== "github") return badRequest(`Unsupported suggestion source: ${body.source}`);
    const result = await importGitHubSuggestions(id, body);
    return ok(result);
  } catch (err) {
    if (err instanceof SyntaxError) return badRequest("Invalid JSON body");
    if (err instanceof Error) return badRequest(err.message);
    return serverError(err);
  }
}
