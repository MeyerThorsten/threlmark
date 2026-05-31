import { ok, serverError } from "@/lib/api";
import { buildPortfolio } from "@/lib/portfolio";

export async function GET() {
  try {
    return ok(await buildPortfolio());
  } catch (err) {
    return serverError(err);
  }
}
