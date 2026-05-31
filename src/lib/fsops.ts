/**
 * Low-level filesystem operations for Threlmark's local-first disk store.
 *
 * Every entity is a JSON file that is the single source of truth. Writes are
 * atomic: we write to a temp file in the same directory, then `rename` over the
 * target. `rename` is atomic on a single filesystem, so a crash mid-write leaves
 * the previous file intact — the source-of-truth JSON can never be truncated.
 *
 * (Ported from IdeaClyst's persistence pattern: ideaclyst/src/lib/runs/store.ts.)
 */

import { access, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

/** Write atomically via a same-dir temp file + rename. */
export async function writeFileAtomic(
  path: string,
  contents: string,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
  await writeFile(tmp, contents, "utf8");
  await rename(tmp, path);
}

/** Serialize a value as pretty JSON and write it atomically. */
export async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFileAtomic(path, `${JSON.stringify(value, null, 2)}\n`);
}

/** Read and parse a JSON file. Returns null if the file does not exist. */
export async function readJson<T = unknown>(path: string): Promise<T | null> {
  try {
    const raw = await readFile(path, "utf8");
    return JSON.parse(raw) as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

export async function pathExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

export async function ensureDir(p: string): Promise<void> {
  await mkdir(p, { recursive: true });
}
