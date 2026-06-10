import { badRequest, created, ok, parseBody, serverError } from "@/lib/api";
import { createProject, listProjects, type CreateProjectInput } from "@/lib/projects/store";
import { getTemplate } from "@/lib/templates";

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
    const body = await parseBody<
      { name?: string; template?: string } & Omit<CreateProjectInput, "name">
    >(req);
    if (!body.name || !body.name.trim()) return badRequest("name is required");
    if (body.template && !getTemplate(body.template)) {
      return badRequest(`Unknown template: ${body.template}`);
    }
    // A vertical template seeds categories/limits/policies; explicit fields win.
    const tmpl = getTemplate(body.template);
    const project = await createProject({
      name: body.name,
      description: body.description,
      repoPath: body.repoPath,
      color: body.color,
      categories: body.categories ?? tmpl?.categories,
      wipLimits: body.wipLimits ?? tmpl?.wipLimits,
      lanePolicies: body.lanePolicies ?? tmpl?.lanePolicies,
    });
    return created(project);
  } catch (err) {
    if (err instanceof SyntaxError) return badRequest("Invalid JSON body");
    return serverError(err);
  }
}
