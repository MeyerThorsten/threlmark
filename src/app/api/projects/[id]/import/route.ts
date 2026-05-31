import { readFile } from "node:fs/promises";

import { badRequest, notFound, ok, parseBody, serverError } from "@/lib/api";
import { importRoadmapHtml } from "@/lib/importer/roadmap-html";
import { importTrelloJson } from "@/lib/importer/trello";
import { getProject } from "@/lib/projects/store";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    if (!(await getProject(id))) return notFound(`Project not found: ${id}`);

    const body = await parseBody<{
      format?: string;
      roadmapHtml?: string;
      trelloJson?: string;
      path?: string;
    }>(req);
    const format = body.format === "trello" ? "trello" : "roadmap";
    let contents = format === "trello" ? body.trelloJson : body.roadmapHtml;
    if (!contents && body.path) {
      try {
        contents = await readFile(body.path, "utf8");
      } catch {
        return badRequest(`Could not read file at path: ${body.path}`);
      }
    }
    if (!contents || !contents.trim()) {
      return badRequest(
        format === "trello"
          ? "Provide `trelloJson` (the export contents) or `path`"
          : "Provide `roadmapHtml` (the file contents) or `path`",
      );
    }

    const result =
      format === "trello"
        ? await importTrelloJson(id, contents)
        : await importRoadmapHtml(id, contents);
    return ok(result);
  } catch (err) {
    if (err instanceof SyntaxError) return badRequest("Invalid JSON body");
    if (err instanceof Error) return badRequest(err.message);
    return serverError(err);
  }
}
