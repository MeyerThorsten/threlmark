/**
 * Canonical on-disk layout for Threlmark. The data root is a shared hub that all
 * of the user's apps point at, so it defaults to `~/.threlmark` (home-based, not
 * repo-relative). Override with THRELMARK_DATA_DIR.
 *
 *   <root>/
 *     threlmark.json                 manifest
 *     links.json                     global cross-project link/dep graph
 *     projects/<projectId>/
 *       project.json                 project metadata
 *       board.json                   lane ordering
 *       items/<itemId>.json          one roadmap card per file
 *       suggestions/<sugId>.json     external-tool drop zone (the Inbox)
 *       suggestions/.dismissed/<sugId>.json
 *       ROADMAP.md
 *     shared/items/<itemId>.json     shared items referenced by many projects
 *     archive/projects/<projectId>/  archived projects
 */

import { homedir } from "node:os";
import { join } from "node:path";

export function dataRoot(): string {
  const override = process.env.THRELMARK_DATA_DIR;
  if (override && override.trim()) return override;
  return join(homedir(), ".threlmark");
}

export const manifestPath = () => join(dataRoot(), "threlmark.json");
export const linksPath = () => join(dataRoot(), "links.json");

export const projectsRoot = () => join(dataRoot(), "projects");
export const projectDir = (id: string) => join(projectsRoot(), id);
export const projectJsonPath = (id: string) => join(projectDir(id), "project.json");
export const boardPath = (id: string) => join(projectDir(id), "board.json");
export const roadmapMdPath = (id: string) => join(projectDir(id), "ROADMAP.md");

export const itemsDir = (id: string) => join(projectDir(id), "items");
export const itemPath = (projectId: string, itemId: string) =>
  join(itemsDir(projectId), `${itemId}.json`);

export const commentsDir = (id: string) => join(projectDir(id), "comments");
export const itemCommentsDir = (projectId: string, itemId: string) =>
  join(commentsDir(projectId), itemId);
export const itemCommentPath = (projectId: string, itemId: string, commentId: string) =>
  join(itemCommentsDir(projectId, itemId), `${commentId}.json`);

export const handoffsDir = (id: string) => join(projectDir(id), "handoffs");
export const handoffPath = (projectId: string, handoffId: string) =>
  join(handoffsDir(projectId), `${handoffId}.json`);

export const reportsDir = (id: string) => join(projectDir(id), "reports");
export const appliedReportsDir = (id: string) => join(reportsDir(id), ".applied");
export const reportPath = (projectId: string, name: string) =>
  join(reportsDir(projectId), name);

export const suggestionsDir = (id: string) => join(projectDir(id), "suggestions");
export const dismissedDir = (id: string) => join(suggestionsDir(id), ".dismissed");
export const suggestionPath = (projectId: string, sugId: string) =>
  join(suggestionsDir(projectId), `${sugId}.json`);
export const dismissedPath = (projectId: string, sugId: string) =>
  join(dismissedDir(projectId), `${sugId}.json`);

export const sharedRoot = () => join(dataRoot(), "shared");
export const sharedItemsDir = () => join(sharedRoot(), "items");
export const sharedItemPath = (itemId: string) =>
  join(sharedItemsDir(), `${itemId}.json`);

export const archiveRoot = () => join(dataRoot(), "archive", "projects");
export const archivedProjectDir = (id: string) => join(archiveRoot(), id);
