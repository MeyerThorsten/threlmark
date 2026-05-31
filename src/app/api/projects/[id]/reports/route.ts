import { ok, serverError } from "@/lib/api";
import { ingestReports, listRecentReports } from "@/lib/reports/store";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Ingest any dropped report files (file fallback), then return recent reports.
 * The board polls this so agent reports surface live and dropped files apply.
 */
export async function GET(_req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const ingested = await ingestReports(id);
    const reports = await listRecentReports(id);
    return ok({ ingested, reports });
  } catch (err) {
    return serverError(err);
  }
}
