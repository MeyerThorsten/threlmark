/**
 * Shared items — one canonical card referenced by several projects. The full
 * fields live once at <root>/shared/items/<id>.json; each consuming project
 * holds a thin local item carrying `sharedRef: "shared/<id>"` so the card still
 * appears on that project's board.
 */

import { readdir } from "node:fs/promises";

import { readJson, writeJson, pathExists } from "../fsops";
import { makeId } from "../ids";
import { readItem, writeItem } from "../items/io";
import { getBoard, placeInLane, writeBoard } from "../board/store";
import { sharedItemPath, sharedItemsDir } from "../paths";
import { normalizeItem } from "../schema/normalize";
import { migrate } from "../schema/version";
import { SCHEMA_VERSION, type RoadmapItem } from "../schema/types";

const SHARED_PROJECT_ID = "shared";

export async function createSharedItem(input: {
  title: string;
  description?: string;
  category?: string;
}): Promise<RoadmapItem> {
  const now = new Date().toISOString();
  const id = makeId(input.title || "shared");
  const item = normalizeItem(
    {
      id,
      projectId: SHARED_PROJECT_ID,
      title: input.title,
      description: input.description,
      category: input.category,
      createdAt: now,
      updatedAt: now,
    },
    SHARED_PROJECT_ID,
    now,
  );
  await writeJson(sharedItemPath(id), item);
  return item;
}

export async function getSharedItem(id: string): Promise<RoadmapItem | null> {
  const raw = await readJson<Record<string, unknown>>(sharedItemPath(id));
  if (!raw) return null;
  return normalizeItem(migrate(raw), SHARED_PROJECT_ID, new Date().toISOString());
}

export async function listSharedItems(): Promise<RoadmapItem[]> {
  if (!(await pathExists(sharedItemsDir()))) return [];
  const files = await readdir(sharedItemsDir());
  const now = new Date().toISOString();
  const items: RoadmapItem[] = [];
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    const raw = await readJson<Record<string, unknown>>(`${sharedItemsDir()}/${file}`);
    if (raw) items.push(normalizeItem(migrate(raw), SHARED_PROJECT_ID, now));
  }
  return items;
}

/**
 * Make a project reference a shared item. If `existingItemId` is given, that
 * project item is converted into a pointer (gains `sharedRef`); otherwise a new
 * pointer item is created and added to the board.
 */
export async function attachSharedToProject(
  sharedId: string,
  projectId: string,
  existingItemId?: string,
): Promise<RoadmapItem> {
  const shared = await getSharedItem(sharedId);
  if (!shared) throw new Error(`Shared item not found: ${sharedId}`);
  const sharedRef = `shared/${sharedId}`;
  const now = new Date().toISOString();

  if (existingItemId) {
    const current = await readItem(projectId, existingItemId);
    if (!current) throw new Error(`Item not found: ${projectId}/${existingItemId}`);
    const updated: RoadmapItem = {
      ...current,
      sharedRef,
      schemaVersion: SCHEMA_VERSION,
      updatedAt: now,
    };
    await writeItem(updated);
    return updated;
  }

  const id = makeId(shared.title);
  const pointer = normalizeItem(
    {
      ...shared,
      id,
      projectId,
      sharedRef,
      createdAt: now,
      updatedAt: now,
    },
    projectId,
    now,
  );
  await writeItem(pointer);
  const board = await getBoard(projectId);
  await writeBoard(projectId, placeInLane(board, id, pointer.status));
  return pointer;
}
