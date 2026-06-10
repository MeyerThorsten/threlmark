/**
 * Raw item file access — no board dependency, so the board store can reconcile
 * against the item set without a circular import.
 */

import { readdir, rm } from "node:fs/promises";

import { readJson, writeJson, pathExists } from "../fsops";
import { itemPath, itemsDir } from "../paths";
import { normalizeItem } from "../schema/normalize";
import { migrate } from "../schema/version";
import type { RoadmapItem } from "../schema/types";

export async function readItem(
  projectId: string,
  itemId: string,
): Promise<RoadmapItem | null> {
  const raw = await readJson<Record<string, unknown>>(itemPath(projectId, itemId));
  if (!raw) return null;
  const now = new Date().toISOString();
  return normalizeItem(migrate(raw), projectId, now);
}

export async function writeItem(item: RoadmapItem): Promise<void> {
  await writeJson(itemPath(item.projectId, item.id), item);
}

export async function deleteItemFile(
  projectId: string,
  itemId: string,
): Promise<void> {
  await rm(itemPath(projectId, itemId), { force: true });
}

export async function listItems(projectId: string): Promise<RoadmapItem[]> {
  const dir = itemsDir(projectId);
  if (!(await pathExists(dir))) return [];
  const files = await readdir(dir);
  const now = new Date().toISOString();
  // One file per item — read them concurrently; order follows readdir.
  const raws = await Promise.all(
    files
      .filter((file) => file.endsWith(".json"))
      .map((file) => readJson<Record<string, unknown>>(`${dir}/${file}`)),
  );
  return raws
    .filter((raw): raw is Record<string, unknown> => !!raw)
    .map((raw) => normalizeItem(migrate(raw), projectId, now));
}
