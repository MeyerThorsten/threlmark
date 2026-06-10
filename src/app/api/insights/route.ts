import { ok, serverError } from "@/lib/api";
import { portfolioInsights } from "@/lib/insights";

export async function GET() {
  try {
    return ok(await portfolioInsights());
  } catch (err) {
    return serverError(err);
  }
}
