#!/usr/bin/env node
/**
 * Threlmark backup — tar.gz the whole data root into <root>/backups/ and keep
 * the most recent 10 archives. Restoring is just extracting: the store is
 * plain files, no import step needed.
 *
 *   npm run backup
 *   node scripts/backup.mjs [/path/to/root]
 *   THRELMARK_BACKUP_KEEP=30 npm run backup
 */

import { execFile } from "node:child_process";
import { mkdir, readdir, rm, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

const root =
  process.argv[2] || process.env.THRELMARK_DATA_DIR || join(homedir(), ".threlmark");
const keep = Math.max(1, Number(process.env.THRELMARK_BACKUP_KEEP) || 10);
const backupsDir = join(root, "backups");

if (!(await stat(root).catch(() => null))) {
  console.error(`No data root at ${root} — nothing to back up.`);
  process.exit(1);
}

await mkdir(backupsDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const archive = join(backupsDir, `threlmark-${stamp}.tgz`);

// --exclude backups so archives never nest themselves.
await run("tar", ["-czf", archive, "--exclude", "./backups", "-C", root, "."]);
const size = (await stat(archive)).size;
console.log(`✓ ${archive} (${(size / 1024).toFixed(0)} KB)`);

// Rotate: newest `keep` archives survive.
const archives = (await readdir(backupsDir))
  .filter((f) => f.startsWith("threlmark-") && f.endsWith(".tgz"))
  .sort()
  .reverse();
for (const old of archives.slice(keep)) {
  await rm(join(backupsDir, old), { force: true });
  console.log(`  rotated out ${old}`);
}
console.log(`${Math.min(archives.length, keep)} backup(s) kept in ${backupsDir}`);
