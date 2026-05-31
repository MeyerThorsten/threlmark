import { badRequest, ok, parseBody, serverError } from "@/lib/api";
import { getBoard, setLaneOrder } from "@/lib/board/store";
import { LANES, type Lane } from "@/lib/schema/types";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    return ok(await getBoard(id));
  } catch (err) {
    return serverError(err);
  }
}

export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const body = await parseBody<{ lane?: string; orderedIds?: string[] }>(req);
    if (!body.lane || !LANES.includes(body.lane as Lane)) {
      return badRequest("lane must be one of: " + LANES.join(", "));
    }
    if (!Array.isArray(body.orderedIds)) return badRequest("orderedIds (string[]) is required");
    const board = await setLaneOrder(id, body.lane as Lane, body.orderedIds);
    return ok(board);
  } catch (err) {
    if (err instanceof SyntaxError) return badRequest("Invalid JSON body");
    return serverError(err);
  }
}
