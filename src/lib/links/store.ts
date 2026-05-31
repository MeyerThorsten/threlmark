/**
 * Cross-project link/dependency graph. A single <root>/links.json holds every
 * edge so the portfolio can render dependencies in one read. Edges use global
 * addresses (`projectId/itemId` or `shared/<itemId>`).
 */

import { readJson, writeJson } from "../fsops";
import { makeId } from "../ids";
import { linksPath } from "../paths";
import { LINK_KINDS, SCHEMA_VERSION, type Link, type LinkKind, type LinksFile } from "../schema/types";

function normalize(raw: Record<string, unknown> | null): LinksFile {
  const linksRaw = Array.isArray(raw?.links) ? (raw!.links as unknown[]) : [];
  const links: Link[] = [];
  for (const l of linksRaw) {
    if (!l || typeof l !== "object") continue;
    const e = l as Record<string, unknown>;
    if (typeof e.from !== "string" || typeof e.to !== "string") continue;
    links.push({
      id: typeof e.id === "string" ? e.id : makeId("link"),
      from: e.from,
      to: e.to,
      kind: LINK_KINDS.includes(e.kind as LinkKind) ? (e.kind as LinkKind) : "relates",
      note: typeof e.note === "string" ? e.note : undefined,
      createdAt: typeof e.createdAt === "string" ? e.createdAt : new Date().toISOString(),
    });
  }
  return { schemaVersion: SCHEMA_VERSION, links, updatedAt: new Date().toISOString() };
}

async function read(): Promise<LinksFile> {
  return normalize(await readJson<Record<string, unknown>>(linksPath()));
}

async function persist(file: LinksFile): Promise<void> {
  await writeJson(linksPath(), { ...file, updatedAt: new Date().toISOString() });
}

export async function listLinks(): Promise<Link[]> {
  return (await read()).links;
}

export async function createLink(input: {
  from: string;
  to: string;
  kind?: string;
  note?: string;
}): Promise<Link> {
  if (!input.from || !input.to) throw new Error("from and to are required");
  const file = await read();
  const link: Link = {
    id: makeId("link"),
    from: input.from,
    to: input.to,
    kind: LINK_KINDS.includes(input.kind as LinkKind) ? (input.kind as LinkKind) : "relates",
    note: input.note?.trim() || undefined,
    createdAt: new Date().toISOString(),
  };
  file.links.push(link);
  await persist(file);
  return link;
}

export async function deleteLink(id: string): Promise<void> {
  const file = await read();
  file.links = file.links.filter((l) => l.id !== id);
  await persist(file);
}

/** Remove every edge touching an address (e.g. when its item is deleted). */
export async function removeLinksForAddress(address: string): Promise<void> {
  const file = await read();
  const next = file.links.filter((l) => l.from !== address && l.to !== address);
  if (next.length !== file.links.length) {
    file.links = next;
    await persist(file);
  }
}

/** Rewrite every edge pointing at `oldAddress` to `newAddress` (cross-project move). */
export async function rewriteAddress(oldAddress: string, newAddress: string): Promise<void> {
  const file = await read();
  let changed = false;
  for (const l of file.links) {
    if (l.from === oldAddress) { l.from = newAddress; changed = true; }
    if (l.to === oldAddress) { l.to = newAddress; changed = true; }
  }
  if (changed) await persist(file);
}

export function addLinksForItem(links: Link[], address: string): Link[] {
  return links.filter((l) => l.from === address || l.to === address);
}
