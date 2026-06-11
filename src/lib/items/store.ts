/**
 * Item store — roadmap card CRUD + lane moves. Items follow IdeaClyst's
 * read-merge-write discipline (preserve id/createdAt, bump updatedAt, atomic
 * write). Board ordering is updated alongside structural changes; everything
 * else relies on the board's self-reconciliation on read.
 */

import { getBoard, placeInLane, removeFromBoard, writeBoard } from "../board/store";
import { emitEvent, eventItem } from "../events";
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
  labels?: string[];
  dueDate?: string;
  scheduledFor?: string;
  source?: string;
  sharedRef?: string;
  sourceId?: string;
  sourceUrl?: string;
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
  await emitEvent({
    type: "item.created",
    at: now,
    projectId,
    itemId: id,
    item: eventItem(item),
  });
  return withPriority(item);
}

export async function upsertItem(
  projectId: string,
  input: CreateItemInput,
): Promise<RoadmapItemView> {
  if (input.id) {
    const current = await readItem(projectId, input.id);
    if (current) {
      const patch = { ...input };
      delete patch.id;
      return updateItem(projectId, current.id, patch);
    }
  }
  return createItem(projectId, input);
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
  const laneChanged = merged.status !== current.status;
  if (laneChanged) {
    merged.transitions = [...merged.transitions, { to: merged.status, at: now }];
  }
  await writeItem(merged);
  // If status changed, board self-reconciles on next read; nothing else to do.
  if (laneChanged) {
    await emitEvent({
      type: merged.status === "done" ? "item.done" : "item.moved",
      at: now,
      projectId,
      itemId,
      item: eventItem(merged),
      data: { fromLane: current.status, toLane: merged.status },
    });
  }
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
  if (lane !== current.status) {
    await emitEvent({
      type: lane === "done" ? "item.done" : "item.moved",
      at: now,
      projectId,
      itemId,
      item: eventItem(updated),
      data: { fromLane: current.status, toLane: lane },
    });
  }
  return withPriority(updated);
}
