import { badRequest, notFound, ok, parseBody, serverError } from "@/lib/api";
import { moveItemToProject } from "@/lib/crossproject";
import { moveLane } from "@/lib/items/store";
import { LANES, type Lane } from "@/lib/schema/types";

type Ctx = { params: Promise<{ id: string; itemId: string }> };

/**
 * POST move: either a lane move within a project (`{toLane, toIndex}`) or a
 * cross-project move (`{toProjectId}`).
 */
export async function POST(req: Request, { params }: Ctx) {
  try {
    const { id, itemId } = await params;
    const body = await parseBody<{ toLane?: string; toIndex?: number; toProjectId?: string }>(req);

    if (body.toProjectId) {
      const moved = await moveItemToProject(`${id}/${itemId}`, body.toProjectId);
      return ok(moved);
    }

    if (body.toLane) {
      if (!LANES.includes(body.toLane as Lane)) {
        return badRequest(`Invalid lane: ${body.toLane}`);
      }
      const item = await moveLane(id, itemId, body.toLane as Lane, body.toIndex);
      return ok(item);
    }

    return badRequest("Provide either { toLane } or { toProjectId }");
  } catch (err) {
    if (err instanceof SyntaxError) return badRequest("Invalid JSON body");
    if (err instanceof Error && /not found/i.test(err.message)) {
      return notFound(err.message);
    }
    return serverError(err);
  }
}
