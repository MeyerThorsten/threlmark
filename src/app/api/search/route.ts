import { ok, serverError } from "@/lib/api";
import { searchAll } from "@/lib/search";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const q = url.searchParams.get("q") ?? "";
    const limit = Number(url.searchParams.get("limit")) || 20;
    const results = await searchAll(q, { limit: Math.min(50, Math.max(1, limit)) });
    return ok({ query: q, results });
  } catch (err) {
    return serverError(err);
  }
}
