#!/usr/bin/env node
/**
 * Threlmark store doctor — standalone integrity checker for the data root
 * (works with the app stopped). Read-only: reports, never repairs.
 *
 *   npm run doctor            # checks ~/.threlmark (or THRELMARK_DATA_DIR)
 *   node scripts/doctor.mjs /path/to/root
 *
 * Exit code 1 when errors are found (warnings alone exit 0), so it slots into
 * cron/CI. Checks: malformed JSON, project.json sanity, item id/file and
 * projectId mismatches, board references to missing items, items absent from
 * the board (informational — the board self-heals), dangling link addresses.
 */

import { readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

/** @typedef {{ level: "error"|"warn"|"info", where: string, message: string }} Issue */

async function exists(p) {
  return stat(p).then(() => true).catch(() => false);
}

async function loadJson(path, issues, where) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (err) {
    issues.push({
      level: "error",
      where,
      message: `malformed JSON: ${err instanceof Error ? err.message : "unreadable"}`,
    });
    return null;
  }
}

/** Run every check over one data root. @returns {Promise<Issue[]>} */
export async function diagnose(root) {
  /** @type {Issue[]} */
  const issues = [];
  const projectsRoot = join(root, "projects");
  if (!(await exists(projectsRoot))) {
    issues.push({ level: "warn", where: root, message: "no projects/ directory — empty store?" });
    return issues;
  }

  const itemAddresses = new Set();
  const entries = await readdir(projectsRoot, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const pid = entry.name;
    const pdir = join(projectsRoot, pid);

    // project.json
    const pjPath = join(pdir, "project.json");
    if (!(await exists(pjPath))) {
      issues.push({ level: "error", where: `projects/${pid}`, message: "missing project.json" });
    } else {
      const pj = await loadJson(pjPath, issues, `projects/${pid}/project.json`);
      if (pj && pj.id !== pid) {
        issues.push({
          level: "error",
          where: `projects/${pid}/project.json`,
          message: `project id "${pj.id}" does not match directory name "${pid}"`,
        });
      }
    }

    // items
    const itemIds = new Set();
    const itemsDir = join(pdir, "items");
    if (await exists(itemsDir)) {
      for (const file of await readdir(itemsDir)) {
        if (!file.endsWith(".json")) continue;
        const idFromFile = file.replace(/\.json$/, "");
        const item = await loadJson(join(itemsDir, file), issues, `projects/${pid}/items/${file}`);
        if (!item) continue;
        itemIds.add(idFromFile);
        itemAddresses.add(`${pid}/${idFromFile}`);
        if (item.id && item.id !== idFromFile) {
          issues.push({
            level: "error",
            where: `projects/${pid}/items/${file}`,
            message: `item id "${item.id}" does not match its file name`,
          });
        }
        if (item.projectId && item.projectId !== pid) {
          issues.push({
            level: "error",
            where: `projects/${pid}/items/${file}`,
            message: `projectId "${item.projectId}" does not match owning project "${pid}"`,
          });
        }
        if (typeof item.title !== "string" || !item.title.trim()) {
          issues.push({
            level: "warn",
            where: `projects/${pid}/items/${file}`,
            message: "item has no title (will normalize to 'Untitled')",
          });
        }
      }
    }

    // board
    const board = (await exists(join(pdir, "board.json")))
      ? await loadJson(join(pdir, "board.json"), issues, `projects/${pid}/board.json`)
      : null;
    if (board?.lanes) {
      const onBoard = new Set();
      for (const [lane, ids] of Object.entries(board.lanes)) {
        if (!Array.isArray(ids)) continue;
        for (const id of ids) {
          onBoard.add(id);
          if (!itemIds.has(id)) {
            issues.push({
              level: "warn",
              where: `projects/${pid}/board.json`,
              message: `lane "${lane}" references missing item "${id}" (board self-heals on read)`,
            });
          }
        }
      }
      for (const id of itemIds) {
        if (!onBoard.has(id)) {
          issues.push({
            level: "info",
            where: `projects/${pid}/board.json`,
            message: `item "${id}" not on the board yet (added on next read)`,
          });
        }
      }
    }
  }

  // shared items count as valid link targets
  const sharedDir = join(root, "shared", "items");
  if (await exists(sharedDir)) {
    for (const file of await readdir(sharedDir)) {
      if (file.endsWith(".json")) itemAddresses.add(`shared/${file.replace(/\.json$/, "")}`);
    }
  }

  // links
  const linksPath = join(root, "links.json");
  if (await exists(linksPath)) {
    const linksFile = await loadJson(linksPath, issues, "links.json");
    for (const link of linksFile?.links ?? []) {
      for (const end of ["from", "to"]) {
        const address = link?.[end];
        if (typeof address === "string" && !itemAddresses.has(address)) {
          issues.push({
            level: "warn",
            where: "links.json",
            message: `link ${link.id ?? "?"} ${end} → "${address}" points at nothing`,
          });
        }
      }
    }
  }

  return issues;
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop());
if (isMain) {
  const root =
    process.argv[2] || process.env.THRELMARK_DATA_DIR || join(homedir(), ".threlmark");
  const issues = await diagnose(root);
  const counts = { error: 0, warn: 0, info: 0 };
  for (const issue of issues) {
    counts[issue.level]++;
    const tag = { error: "✖ ERROR", warn: "⚠ WARN ", info: "ℹ info " }[issue.level];
    console.log(`${tag}  ${issue.where}\n         ${issue.message}`);
  }
  console.log(
    `\nthrelmark doctor — ${root}\n${counts.error} errors · ${counts.warn} warnings · ${counts.info} info${issues.length === 0 ? " — store is healthy ✓" : ""}`,
  );
  process.exit(counts.error > 0 ? 1 : 0);
}
