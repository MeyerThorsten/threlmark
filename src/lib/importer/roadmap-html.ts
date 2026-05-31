/**
 * Import a project roadmap from the original localStorage kanban (roadmap.html).
 * It extracts the `const defaults = [ ... ]` array — JS object literals with
 * unquoted keys, not JSON — and parses it tolerantly with JSON5 (never eval).
 * Imported items keep their original id so re-import is idempotent.
 */

import JSON5 from "json5";

import { writeFileAtomic } from "../fsops";
import { createItem } from "../items/store";
import { listItemViews } from "../items/store";
import { roadmapMdPath } from "../paths";
import { toCategory, toStatus } from "../schema/normalize";
import { roadmapMarkdown } from "../markdown";

/** Locate and slice the `defaults` array literal, string-aware bracket matching. */
export function extractDefaultsArray(html: string): string {
  const m = /(?:const|let|var)\s+defaults\s*=\s*\[/.exec(html);
  if (!m) throw new Error("Could not find a `defaults = [...]` array in the file");
  const start = m.index + m[0].length - 1; // index of the opening '['

  let depth = 0;
  let str: string | null = null;
  let escaped = false;
  for (let i = start; i < html.length; i++) {
    const ch = html[i];
    if (str) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === str) str = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") str = ch;
    else if (ch === "[") depth++;
    else if (ch === "]") {
      depth--;
      if (depth === 0) return html.slice(start, i + 1);
    }
  }
  throw new Error("Unterminated `defaults` array — could not find its closing bracket");
}

export interface ParsedCard {
  id?: string;
  title?: string;
  category?: string;
  status?: string;
  impact?: number;
  evidence?: number;
  fit?: number;
  effort?: number;
  description?: string;
  files?: string;
  acceptance?: string[];
  labels?: string[];
}

export function parseRoadmapHtml(html: string): ParsedCard[] {
  const slice = extractDefaultsArray(html);
  let parsed: unknown;
  try {
    parsed = JSON5.parse(slice);
  } catch (err) {
    throw new Error(
      `Failed to parse the defaults array: ${err instanceof Error ? err.message : "invalid syntax"}`,
    );
  }
  if (!Array.isArray(parsed)) throw new Error("`defaults` was not an array");
  return parsed as ParsedCard[];
}

/** Seed a project from roadmap.html. Returns the number of items imported. */
export async function importRoadmapHtml(
  projectId: string,
  html: string,
): Promise<{ imported: number }> {
  const cards = parseRoadmapHtml(html);
  let imported = 0;
  for (const card of cards) {
    if (!card.title) continue;
    await createItem(projectId, {
      id: typeof card.id === "string" ? card.id : undefined,
      title: card.title,
      category: toCategory(card.category),
      status: toStatus(card.status),
      impact: card.impact,
      evidence: card.evidence,
      fit: card.fit,
      effort: card.effort,
      description: card.description ?? "",
      files: card.files ?? "",
      acceptance: Array.isArray(card.acceptance) ? card.acceptance : [],
      labels: Array.isArray(card.labels) ? card.labels : undefined,
    });
    imported++;
  }

  // Regenerate the human-readable mirror.
  const items = await listItemViews(projectId);
  await writeFileAtomic(roadmapMdPath(projectId), roadmapMarkdown(projectId, items));
  return { imported };
}
