/**
 * Item store — roadmap card CRUD + lane moves. Items follow IdeaClyst's
 * read-merge-write discipline (preserve id/createdAt, bump updatedAt, atomic
 * write). Board ordering is updated alongside structural changes; everything
 * else relies on the board's self-reconciliation on read.
 */

import { getBoard, placeInLane, removeFromBoard, writeBoard } from "../board/store";
import { makeId } from "../ids";
import { withPriority } from "../priority";
import { normalizeItem } from "../schema/normalize";
import { SCHEMA_VERSION, type Lane, type RoadmapItem, type RoadmapItemView } from "../schema/types";
import { deleteItemFile, listItems, readItem, writeItem } from "./io";

export { listItems } from "./io";

export interface CreateItemInput {
  title: string;
  category?: string;
  status?: string;
  impact?: number;
  evidence?: number;
  fit?: number;
  effort?: number;
  description?: string;
  files?: string;
  acceptance?: string[];
  source?: string;
  sharedRef?: string;
  /** Reuse an explicit id (used by the importer for idempotency). */
  id?: string;
}

export async function getItem(
  projectId: string,
  itemId: string,
): Promise<RoadmapItemView | null> {
  const item = await readItem(projectId, itemId);
  return item ? withPriority(item) : null;
}

export async function listItemViews(projectId: string): Promise<RoadmapItemView[]> {
  return (await listItems(projectId)).map(withPriority);
}

export async function createItem(
  projectId: string,
  input: CreateItemInput,
): Promise<RoadmapItemView> {
  const now = new Date().toISOString();
  const id = input.id?.trim() || makeId(input.title || "item");
  const item = normalizeItem(
    { ...input, id, projectId, createdAt: now, updatedAt: now },
    projectId,
    now,
  );
  await writeItem(item);

  const board = await getBoard(projectId);
  await writeBoard(projectId, placeInLane(board, id, item.status));
  return withPriority(item);
}

export async function updateItem(
  projectId: string,
  itemId: string,
  patch: Partial<Omit<RoadmapItem, "id" | "projectId" | "createdAt" | "schemaVersion">>,
): Promise<RoadmapItemView> {
  const current = await readItem(projectId, itemId);
  if (!current) throw new Error(`Item not found: ${projectId}/${itemId}`);
  const now = new Date().toISOString();
  const merged = normalizeItem(
    {
      ...current,
      ...patch,
      id: current.id,
      projectId,
      createdAt: current.createdAt,
      updatedAt: now,
    },
    projectId,
    now,
  );
  // Record a lane transition when the status actually changed.
  if (merged.status !== current.status) {
    merged.transitions = [...merged.transitions, { to: merged.status, at: now }];
  }
  await writeItem(merged);
  // If status changed, board self-reconciles on next read; nothing else to do.
  return withPriority(merged);
}

export async function deleteItem(projectId: string, itemId: string): Promise<void> {
  await deleteItemFile(projectId, itemId);
  const board = await getBoard(projectId);
  await writeBoard(projectId, removeFromBoard(board, itemId));
}

/** Move an item to a lane (sets status) at an explicit position. */
export async function moveLane(
  projectId: string,
  itemId: string,
  lane: Lane,
  index?: number,
): Promise<RoadmapItemView> {
  const current = await readItem(projectId, itemId);
  if (!current) throw new Error(`Item not found: ${projectId}/${itemId}`);
  const now = new Date().toISOString();
  const transitions =
    lane !== current.status
      ? [...current.transitions, { to: lane, at: now }]
      : current.transitions;
  const updated: RoadmapItem = {
    ...current,
    status: lane,
    transitions,
    schemaVersion: SCHEMA_VERSION,
    updatedAt: now,
  };
  await writeItem(updated);
  const board = await getBoard(projectId);
  await writeBoard(projectId, placeInLane(board, itemId, lane, index));
  return withPriority(updated);
}
