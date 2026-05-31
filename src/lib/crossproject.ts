/**
 * Cross-project operations: move an item to another project, link two items,
 * and refactor duplicates into a shared item. All operate on global addresses
 * (`projectId/itemId`).
 */

import { getBoard, placeInLane, removeFromBoard, writeBoard } from "./board/store";
import { deleteItemFile, readItem, writeItem } from "./items/io";
import { withPriority } from "./priority";
import { createLink, rewriteAddress } from "./links/store";
import { makeAddress, parseAddress } from "./ids";
import { getProject } from "./projects/store";
import { attachSharedToProject, createSharedItem } from "./shared/store";
import type { Link, RoadmapItemView } from "./schema/types";

/** Move an item from one project to another, preserving its id and fixing boards + links. */
export async function moveItemToProject(
  fromAddress: string,
  toProjectId: string,
): Promise<RoadmapItemView> {
  const { projectId: fromProjectId, itemId } = parseAddress(fromAddress);
  if (fromProjectId === toProjectId) {
    const same = await readItem(fromProjectId, itemId);
    if (!same) throw new Error(`Item not found: ${fromAddress}`);
    return withPriority(same);
  }
  if (!(await getProject(toProjectId))) throw new Error(`Project not found: ${toProjectId}`);
  const item = await readItem(fromProjectId, itemId);
  if (!item) throw new Error(`Item not found: ${fromAddress}`);

  const now = new Date().toISOString();
  const moved = { ...item, projectId: toProjectId, updatedAt: now };
  await writeItem(moved);
  await deleteItemFile(fromProjectId, itemId);

  // Fix both boards.
  const fromBoard = await getBoard(fromProjectId);
  await writeBoard(fromProjectId, removeFromBoard(fromBoard, itemId));
  const toBoard = await getBoard(toProjectId);
  await writeBoard(toProjectId, placeInLane(toBoard, itemId, moved.status));

  // Repoint any links at the new address.
  await rewriteAddress(fromAddress, makeAddress(toProjectId, itemId));
  return withPriority(moved);
}

/** Create a cross-project link/dependency edge between two items. */
export async function linkItems(input: {
  from: string;
  to: string;
  kind?: string;
  note?: string;
}): Promise<Link> {
  return createLink(input);
}

/**
 * Refactor duplicated work into one shared item: create the canonical shared
 * item, replace each source with a thin pointer item, and record `duplicates`
 * links for provenance.
 */
export async function shareItem(input: {
  title: string;
  fromItems?: string[];
  description?: string;
  category?: string;
}): Promise<{ sharedId: string; address: string }> {
  const shared = await createSharedItem({
    title: input.title,
    description: input.description,
    category: input.category,
  });
  const sharedAddress = `shared/${shared.id}`;

  for (const addr of input.fromItems ?? []) {
    const { projectId, itemId } = parseAddress(addr);
    const item = await readItem(projectId, itemId);
    if (!item) continue;
    await attachSharedToProject(shared.id, projectId, itemId);
    await createLink({ from: addr, to: sharedAddress, kind: "duplicates" });
  }
  return { sharedId: shared.id, address: sharedAddress };
}
