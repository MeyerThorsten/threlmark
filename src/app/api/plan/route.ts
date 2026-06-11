import { ok, serverError } from "@/lib/api";
import { buildPlan, planMarkdown } from "@/lib/plan";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const limit = Number(url.searchParams.get("limit")) || 10;
    const projectId = url.searchParams.get("project") || undefined;
    const plan = await buildPlan({ limit: Math.min(50, Math.max(1, limit)), projectId });
    if (url.searchParams.get("format") === "md") {
      return new Response(planMarkdown(plan), {
        headers: { "Content-Type": "text/markdown; charset=utf-8" },
      });
    }
    return ok(plan);
  } catch (err) {
    return serverError(err);
  }
}
