import { readFile } from "node:fs/promises";

import { badRequest, notFound, ok, parseBody, serverError } from "@/lib/api";
import { importRoadmapHtml } from "@/lib/importer/roadmap-html";
import { getProject } from "@/lib/projects/store";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    if (!(await getProject(id))) return notFound(`Project not found: ${id}`);

    const body = await parseBody<{ roadmapHtml?: string; path?: string }>(req);
    let html = body.roadmapHtml;
    if (!html && body.path) {
      try {
        html = await readFile(body.path, "utf8");
      } catch {
        return badRequest(`Could not read file at path: ${body.path}`);
      }
    }
    if (!html || !html.trim()) {
      return badRequest("Provide `roadmapHtml` (the file contents) or `path`");
    }

    const result = await importRoadmapHtml(id, html);
    return ok(result);
  } catch (err) {
    if (err instanceof SyntaxError) return badRequest("Invalid JSON body");
    if (err instanceof Error) return badRequest(err.message);
    return serverError(err);
  }
}
