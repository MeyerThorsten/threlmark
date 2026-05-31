/**
 * Suggestions = the Inbox. External tools drop projects/<id>/suggestions/<sugId>.json
 * (only `source` + `title` required). Accepting turns one into a normal roadmap
 * item with `source` set (optionally in a DIFFERENT project — cross-project
 * promote). Dismissing moves it to suggestions/.dismissed/ for audit.
 */

import { readdir, rename, rm } from "node:fs/promises";

import { ensureDir, pathExists, readJson, writeJson } from "../fsops";
import { createItem, type CreateItemInput } from "../items/store";
import {
  dismissedDir,
  dismissedPath,
  suggestionPath,
  suggestionsDir,
} from "../paths";
import { normalizeSuggestion } from "../schema/normalize";
import { migrate } from "../schema/version";
import type { RoadmapItemView, Suggestion, SuggestionView } from "../schema/types";

async function listFiles(projectId: string): Promise<string[]> {
  const dir = suggestionsDir(projectId);
  if (!(await pathExists(dir))) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && e.name.endsWith(".json"))
    .map((e) => e.name);
}

export async function listSuggestions(projectId: string): Promise<SuggestionView[]> {
  const files = await listFiles(projectId);
  const now = new Date().toISOString();
  const out: SuggestionView[] = [];
  for (const file of files) {
    const raw = await readJson<Record<string, unknown>>(`${suggestionsDir(projectId)}/${file}`);
    if (!raw) continue;
    const id = typeof raw.id === "string" && raw.id.trim() ? raw.id : file.replace(/\.json$/, "");
    out.push({ ...normalizeSuggestion(migrate(raw), id, now), id, projectId });
  }
  return out.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
}

export async function countSuggestions(projectId: string): Promise<number> {
  return (await listFiles(projectId)).length;
}

export async function getSuggestion(
  projectId: string,
  sugId: string,
): Promise<SuggestionView | null> {
  const raw = await readJson<Record<string, unknown>>(suggestionPath(projectId, sugId));
  if (!raw) return null;
  const now = new Date().toISOString();
  return { ...normalizeSuggestion(migrate(raw), sugId, now), id: sugId, projectId };
}

export async function upsertSuggestion(
  projectId: string,
  input: Suggestion,
): Promise<SuggestionView> {
  const now = new Date().toISOString();
  const id = input.id?.trim();
  if (!id) throw new Error("Suggestion id is required");
  const suggestion = normalizeSuggestion({ ...input, id, createdAt: input.createdAt ?? now }, id, now);
  await ensureDir(suggestionsDir(projectId));
  await writeJson(suggestionPath(projectId, id), suggestion);
  return { ...suggestion, id, projectId };
}

/** Accept a suggestion into a project (the owning one, or `targetProjectId`). */
export async function acceptSuggestion(
  projectId: string,
  sugId: string,
  targetProjectId?: string,
): Promise<RoadmapItemView> {
  const suggestion = await getSuggestion(projectId, sugId);
  if (!suggestion) throw new Error(`Suggestion not found: ${projectId}/${sugId}`);

  const dest = targetProjectId?.trim() || projectId;
  const input: CreateItemInput = {
    title: suggestion.title,
    category: suggestion.category,
    impact: suggestion.impact,
    evidence: suggestion.evidence,
    fit: suggestion.fit,
    effort: suggestion.effort,
    description: suggestion.description,
    files: suggestion.files,
    acceptance: suggestion.acceptance,
    labels: suggestion.labels,
    source: suggestion.source,
    status: "idea",
  };
  const item = await createItem(dest, input);
  await ensureDir(dismissedDir(projectId));
  await rename(suggestionPath(projectId, sugId), dismissedPath(projectId, sugId)).catch(
    async () => {
      // If rename fails (e.g. cross-device), copy then remove the source.
      await writeJson(dismissedPath(projectId, sugId), suggestion);
      await rm(suggestionPath(projectId, sugId), { force: true });
    },
  );
  return item;
}

export async function dismissSuggestion(projectId: string, sugId: string): Promise<void> {
  const src = suggestionPath(projectId, sugId);
  if (!(await pathExists(src))) return;
  await ensureDir(dismissedDir(projectId));
  await rename(src, dismissedPath(projectId, sugId));
}
