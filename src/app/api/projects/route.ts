import { badRequest, created, ok, parseBody, serverError } from "@/lib/api";
import { createProject, listProjects } from "@/lib/projects/store";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const includeArchived = url.searchParams.get("include") === "archived";
    return ok(await listProjects({ includeArchived }));
  } catch (err) {
    return serverError(err);
  }
}

export async function POST(req: Request) {
  try {
    const body = await parseBody<{ name?: string; description?: string; repoPath?: string; color?: string }>(req);
    if (!body.name || !body.name.trim()) return badRequest("name is required");
    const project = await createProject({
      name: body.name,
      description: body.description,
      repoPath: body.repoPath,
      color: body.color,
    });
    return created(project);
  } catch (err) {
    if (err instanceof SyntaxError) return badRequest("Invalid JSON body");
    return serverError(err);
  }
}
