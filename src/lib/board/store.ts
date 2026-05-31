/**
 * Board store — lane ordering only. The item files own `status`; board.json just
 * records display order per lane. It self-heals on read: any item present in
 * items/ but missing from its status lane is appended; ids with no item file are
 * dropped. This lets external tools that only drop item files work without ever
 * touching board.json.
 */

import { readJson, writeJson } from "../fsops";
import { listItems } from "../items/io";
import { boardPath } from "../paths";
import { LANES, SCHEMA_VERSION, type Board, type Lane } from "../schema/types";

export function emptyBoard(): Board {
  return {
    schemaVersion: SCHEMA_VERSION,
    lanes: { idea: [], ranked: [], development: [], done: [] },
    updatedAt: new Date().toISOString(),
  };
}

function normalizeBoard(raw: Record<string, unknown> | null): Board {
  if (!raw) return emptyBoard();
  const lanesRaw = (raw.lanes ?? {}) as Record<string, unknown>;
  const lanes = {} as Record<Lane, string[]>;
  for (const lane of LANES) {
    const arr = lanesRaw[lane];
    lanes[lane] = Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string") : [];
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    lanes,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : new Date().toISOString(),
  };
}

async function readBoard(projectId: string): Promise<Board> {
  return normalizeBoard(await readJson<Record<string, unknown>>(boardPath(projectId)));
}

export async function writeBoard(projectId: string, board: Board): Promise<void> {
  await writeJson(boardPath(projectId), { ...board, updatedAt: new Date().toISOString() });
}

/** Reconcile a board against the actual item set (pure given the items). */
export function reconcile(
  board: Board,
  items: { id: string; status: Lane }[],
): { board: Board; changed: boolean } {
  const byId = new Map(items.map((i) => [i.id, i.status]));
  const placed = new Set<string>();
  const lanes = {} as Record<Lane, string[]>;
  let changed = false;

  // Keep existing order, dropping ids whose item is gone or moved lanes.
  for (const lane of LANES) {
    lanes[lane] = [];
    for (const id of board.lanes[lane]) {
      if (byId.get(id) === lane && !placed.has(id)) {
        lanes[lane].push(id);
        placed.add(id);
      } else {
        changed = true;
      }
    }
  }
  // Append any items missing from their status lane.
  for (const item of items) {
    if (!placed.has(item.id)) {
      lanes[item.status].push(item.id);
      placed.add(item.id);
      changed = true;
    }
  }
  return { board: { ...board, lanes }, changed };
}

/** Read the board, reconcile it against items/, persist if it changed. */
export async function getBoard(projectId: string): Promise<Board> {
  const board = await readBoard(projectId);
  const items = await listItems(projectId);
  const { board: reconciled, changed } = reconcile(board, items);
  if (changed) await writeBoard(projectId, reconciled);
  return reconciled;
}

/** Remove an id from every lane (mutates a copy, returns new board). */
export function removeFromBoard(board: Board, id: string): Board {
  const lanes = {} as Record<Lane, string[]>;
  for (const lane of LANES) lanes[lane] = board.lanes[lane].filter((x) => x !== id);
  return { ...board, lanes };
}

/** Place an id into a lane at an index (after removing it from all lanes). */
export function placeInLane(
  board: Board,
  id: string,
  lane: Lane,
  index?: number,
): Board {
  const cleared = removeFromBoard(board, id);
  const target = [...cleared.lanes[lane]];
  const at = index === undefined || index < 0 || index > target.length ? target.length : index;
  target.splice(at, 0, id);
  return { ...cleared, lanes: { ...cleared.lanes, [lane]: target } };
}

/** Persist an explicit ordering for one lane (used by drag-reorder). */
export async function setLaneOrder(
  projectId: string,
  lane: Lane,
  orderedIds: string[],
): Promise<Board> {
  const board = await getBoard(projectId);
  const valid = new Set(board.lanes[lane]);
  const next = orderedIds.filter((id) => valid.has(id));
  for (const id of board.lanes[lane]) if (!next.includes(id)) next.push(id);
  const updated: Board = { ...board, lanes: { ...board.lanes, [lane]: next } };
  await writeBoard(projectId, updated);
  return updated;
}
