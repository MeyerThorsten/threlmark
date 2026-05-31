import { readdir } from "node:fs/promises";

import { ensureDir, pathExists, readJson, writeJson } from "../fsops";
import { makeId } from "../ids";
import { itemCommentPath, itemCommentsDir } from "../paths";
import {
  COMMENT_KINDS,
  SCHEMA_VERSION,
  type CommentKind,
  type ItemComment,
} from "../schema/types";

export interface CreateCommentInput {
  kind?: string;
  body?: string;
  author?: string;
}

function toKind(value: unknown): CommentKind {
  return COMMENT_KINDS.includes(value as CommentKind) ? (value as CommentKind) : "comment";
}

function normalizeComment(
  raw: Record<string, unknown>,
  projectId: string,
  itemId: string,
  fallbackId: string,
): ItemComment | null {
  const body = typeof raw.body === "string" ? raw.body.trim() : "";
  if (!body) return null;
  const now = new Date().toISOString();
  return {
    schemaVersion: SCHEMA_VERSION,
    id: typeof raw.id === "string" && raw.id.trim() ? raw.id : fallbackId,
    projectId,
    itemId,
    kind: toKind(raw.kind),
    body,
    author: typeof raw.author === "string" && raw.author.trim() ? raw.author.trim() : undefined,
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : now,
  };
}

export async function listComments(projectId: string, itemId: string): Promise<ItemComment[]> {
  const dir = itemCommentsDir(projectId, itemId);
  if (!(await pathExists(dir))) return [];
  const files = await readdir(dir);
  const comments: ItemComment[] = [];
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    const raw = await readJson<Record<string, unknown>>(`${dir}/${file}`);
    if (!raw) continue;
    const comment = normalizeComment(raw, projectId, itemId, file.replace(/\.json$/, ""));
    if (comment) comments.push(comment);
  }
  return comments.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function createComment(
  projectId: string,
  itemId: string,
  input: CreateCommentInput,
): Promise<ItemComment> {
  const body = input.body?.trim();
  if (!body) throw new Error("Comment body is required");

  const now = new Date().toISOString();
  const id = makeId(input.kind === "decision" ? "decision" : "comment");
  const comment: ItemComment = {
    schemaVersion: SCHEMA_VERSION,
    id,
    projectId,
    itemId,
    kind: toKind(input.kind),
    body,
    author: input.author?.trim() || undefined,
    createdAt: now,
  };
  await ensureDir(itemCommentsDir(projectId, itemId));
  await writeJson(itemCommentPath(projectId, itemId, id), comment);
  return comment;
}
