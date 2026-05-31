import { ok, serverError } from "@/lib/api";
import { portfolioFlow } from "@/lib/metrics";

export async function GET() {
  try {
    return ok(await portfolioFlow());
  } catch (err) {
    return serverError(err);
  }
}
