import { badRequest, notFound, ok, parseBody, serverError } from "@/lib/api";
import { archiveProject, getProject, updateProject } from "@/lib/projects/store";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const project = await getProject(id);
    return project ? ok(project) : notFound(`Project not found: ${id}`);
  } catch (err) {
    return serverError(err);
  }
}

export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const body = await parseBody<Record<string, unknown>>(req);
    const project = await updateProject(id, body);
    return ok(project);
  } catch (err) {
    if (err instanceof SyntaxError) return badRequest("Invalid JSON body");
    if (err instanceof Error && err.message.startsWith("Project not found")) {
      return notFound(err.message);
    }
    return serverError(err);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const project = await archiveProject(id);
    return ok(project);
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("Project not found")) {
      return notFound(err.message);
    }
    return serverError(err);
  }
}
