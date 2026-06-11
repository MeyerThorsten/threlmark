/**
 * Global search across every project: items, inbox suggestions, decision
 * notes and recorded outcomes. Powers the ⌘K command palette, /api/search and
 * the MCP `search` tool. Ranking is deliberately simple and explainable:
 * title prefix > title > label > category > body text.
 */

import { listAllComments } from "./comments/store";
import { listItemViews } from "./items/store";
import { listProjects } from "./projects/store";
import { listSuggestions } from "./suggestions/store";
import type { Status } from "./schema/types";

export type SearchResultType = "item" | "suggestion" | "decision" | "outcome";

export interface SearchResult {
  type: SearchResultType;
  projectId: string;
  projectName: string;
  /** The owning item (absent for suggestions). */
  itemId?: string;
  suggestionId?: string;
  title: string;
  snippet?: string;
  status?: Status;
  score: number;
  /** Where the palette should navigate to. */
  url: string;
}

/** Match score for one haystack; 0 = no match. Pure and unit-tested. */
export function matchScore(
  q: string,
  fields: { title: string; labels?: string[]; category?: string; body?: string },
): number {
  const query = q.trim().toLowerCase();
  if (!query) return 0;
  const title = fields.title.toLowerCase();
  if (title.startsWith(query)) return 100;
  if (title.includes(query)) return 80;
  if ((fields.labels ?? []).some((l) => l.toLowerCase().includes(query))) return 60;
  if (fields.category?.toLowerCase().includes(query)) return 50;
  if (fields.body?.toLowerCase().includes(query)) return 30;
  return 0;
}

/** A short excerpt around the first occurrence of `q` in `body`. */
export function excerpt(body: string, q: string, span = 90): string | undefined {
  const idx = body.toLowerCase().indexOf(q.trim().toLowerCase());
  if (idx < 0) return undefined;
  const start = Math.max(0, idx - 24);
  const slice = body.slice(start, start + span).trim();
  return `${start > 0 ? "…" : ""}${slice}${start + span < body.length ? "…" : ""}`;
}

export async function searchAll(q: string, opts: { limit?: number } = {}): Promise<SearchResult[]> {
  const query = q.trim();
  if (query.length < 2) return [];
  const limit = opts.limit ?? 20;
  const projects = await listProjects();

  const perProject = await Promise.all(
    projects.map(async (p) => {
      const results: SearchResult[] = [];
      const [items, suggestions, comments] = await Promise.all([
        listItemViews(p.id),
        listSuggestions(p.id).catch(() => []),
        listAllComments(p.id).catch(() => []),
      ]);
      const titleById = new Map(items.map((it) => [it.id, it.title]));

      for (const it of items) {
        const score = matchScore(query, {
          title: it.title,
          labels: it.labels,
          category: it.category,
          body: `${it.description}\n${it.files}`,
        });
        if (score > 0) {
          results.push({
            type: "item",
            projectId: p.id,
            projectName: p.name,
            itemId: it.id,
            title: it.title,
            snippet: excerpt(it.description, query),
            status: it.status,
            score,
            url: `/projects/${p.id}?focus=${it.id}`,
          });
        }
        if (it.outcome) {
          const oScore = matchScore(query, { title: "", body: it.outcome });
          if (oScore > 0) {
            results.push({
              type: "outcome",
              projectId: p.id,
              projectName: p.name,
              itemId: it.id,
              title: it.title,
              snippet: excerpt(it.outcome, query),
              status: it.status,
              score: oScore - 5,
              url: `/projects/${p.id}?focus=${it.id}`,
            });
          }
        }
      }

      for (const sug of suggestions) {
        const score = matchScore(query, {
          title: sug.title,
          labels: sug.labels,
          category: sug.category,
          body: sug.description ?? "",
        });
        if (score > 0) {
          results.push({
            type: "suggestion",
            projectId: p.id,
            projectName: p.name,
            suggestionId: sug.id,
            title: sug.title,
            snippet: excerpt(sug.description ?? "", query),
            score: score - 10,
            url: `/projects/${p.id}/inbox`,
          });
        }
      }

      for (const c of comments) {
        if (c.kind !== "decision") continue;
        const score = matchScore(query, { title: "", body: c.body });
        if (score > 0) {
          results.push({
            type: "decision",
            projectId: p.id,
            projectName: p.name,
            itemId: c.itemId,
            title: titleById.get(c.itemId) ?? c.itemId,
            snippet: excerpt(c.body, query),
            score: score - 5,
            url: `/projects/${p.id}?focus=${c.itemId}`,
          });
        }
      }
      return results;
    }),
  );

  return perProject
    .flat()
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.title.localeCompare(b.title) ||
        a.projectName.localeCompare(b.projectName),
    )
    .slice(0, limit);
}
