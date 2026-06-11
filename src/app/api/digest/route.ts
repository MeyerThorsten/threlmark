import { ok, serverError } from "@/lib/api";
import { buildDigest, digestHtml, digestMarkdown, saveDigest } from "@/lib/digest";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const days = Math.min(90, Math.max(1, Number(url.searchParams.get("days")) || 7));
    const digest = await buildDigest(days);
    const saved = url.searchParams.get("save") === "1" ? await saveDigest(digest) : undefined;

    const format = url.searchParams.get("format") ?? "json";
    if (format === "md") {
      return new Response(digestMarkdown(digest), {
        headers: { "Content-Type": "text/markdown; charset=utf-8" },
      });
    }
    if (format === "html") {
      return new Response(digestHtml(digest), {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }
    return ok({ ...digest, saved });
  } catch (err) {
    return serverError(err);
  }
}
