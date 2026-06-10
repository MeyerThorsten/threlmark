/**
 * Project store. Each project is a directory under <root>/projects/<id>/ whose
 * project.json is the source of truth. Archiving moves the whole directory to
 * <root>/archive/projects/<id>/ (still readable).
 */

import { rename, readdir, mkdir } from "node:fs/promises";

import { readJson, writeJson, pathExists, ensureDir } from "../fsops";
import { slugify, shortRand } from "../ids";
import { ensureManifest } from "../manifest";
import {
  archivedProjectDir,
  archiveRoot,
  projectDir,
  projectJsonPath,
  projectsRoot,
} from "../paths";
import { migrate } from "../schema/version";
import {
  LANES,
  SCHEMA_VERSION,
  type Lane,
  type Project,
  type SavedView,
} from "../schema/types";

function normalizeWipLimits(value: unknown): Partial<Record<Lane, number>> | undefined {
  if (!value || typeof value !== "object") return undefined;
  const out: Partial<Record<Lane, number>> = {};
  for (const lane of LANES) {
    const n = (value as Record<string, unknown>)[lane];
    if (typeof n === "number" && Number.isFinite(n) && n > 0) out[lane] = Math.round(n);
  }
  return Object.keys(out).length ? out : undefined;
}

function normalizeLanePolicies(value: unknown): Partial<Record<Lane, string>> | undefined {
  if (!value || typeof value !== "object") return undefined;
  const out: Partial<Record<Lane, string>> = {};
  for (const lane of LANES) {
    const s = (value as Record<string, unknown>)[lane];
    if (typeof s === "string" && s.trim()) out[lane] = s.trim();
  }
  return Object.keys(out).length ? out : undefined;
}

/** Per-project vertical categories: trimmed, unique, capped (≤24 × ≤40 chars). */
export function normalizeCategories(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out = [
    ...new Set(
      value
        .filter((v): v is string => typeof v === "string")
        .map((v) => v.trim().slice(0, 40))
        .filter(Boolean),
    ),
  ].slice(0, 24);
  return out.length ? out : undefined;
}

export function normalizeSavedViews(value: unknown): SavedView[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: SavedView[] = [];
  for (const raw of value.slice(0, 24)) {
    if (!raw || typeof raw !== "object") continue;
    const v = raw as Record<string, unknown>;
    const name = typeof v.name === "string" ? v.name.trim().slice(0, 60) : "";
    if (!name) continue;
    const str = (x: unknown) =>
      typeof x === "string" && x.trim() ? x.trim() : undefined;
    out.push({
      id: typeof v.id === "string" && v.id.trim() ? v.id : `view-${out.length}`,
      name,
      search: str(v.search),
      category: str(v.category),
      label: str(v.label),
    });
  }
  return out.length ? out : undefined;
}

export interface CreateProjectInput {
  name: string;
  description?: string;
  repoPath?: string;
  color?: string;
  categories?: string[];
  wipLimits?: Partial<Record<Lane, number>>;
  lanePolicies?: Partial<Record<Lane, string>>;
}

function normalizeProject(raw: Record<string, unknown>): Project {
  const migrated = migrate(raw);
  return {
    ...migrated,
    schemaVersion: SCHEMA_VERSION,
    id: String(migrated.id ?? ""),
    name: typeof migrated.name === "string" ? migrated.name : String(migrated.id ?? "Untitled"),
    slug: typeof migrated.slug === "string" ? migrated.slug : String(migrated.id ?? ""),
    description: typeof migrated.description === "string" ? migrated.description : undefined,
    repoPath: typeof migrated.repoPath === "string" ? migrated.repoPath : undefined,
    color: typeof migrated.color === "string" ? migrated.color : undefined,
    status: migrated.status === "archived" ? "archived" : "active",
    wipLimits: normalizeWipLimits(migrated.wipLimits),
    lanePolicies: normalizeLanePolicies(migrated.lanePolicies),
    categories: normalizeCategories(migrated.categories),
    savedViews: normalizeSavedViews(migrated.savedViews),
    createdAt: typeof migrated.createdAt === "string" ? migrated.createdAt : new Date().toISOString(),
    updatedAt: typeof migrated.updatedAt === "string" ? migrated.updatedAt : new Date().toISOString(),
  } as Project;
}

/** Pick a stable, human-recognizable project id from the name. */
async function allocateId(name: string): Promise<string> {
  const base = slugify(name);
  if (!(await pathExists(projectDir(base))) && !(await pathExists(archivedProjectDir(base)))) {
    return base;
  }
  return `${base}-${shortRand()}`;
}

export async function createProject(input: CreateProjectInput): Promise<Project> {
  await ensureManifest();
  const name = input.name.trim();
  if (!name) throw new Error("Project name is required");
  const id = await allocateId(name);
  const now = new Date().toISOString();
  const project: Project = {
    schemaVersion: SCHEMA_VERSION,
    id,
    name,
    slug: id,
    description: input.description?.trim() || undefined,
    repoPath: input.repoPath?.trim() || undefined,
    color: input.color?.trim() || undefined,
    status: "active",
    wipLimits: normalizeWipLimits(input.wipLimits),
    lanePolicies: normalizeLanePolicies(input.lanePolicies),
    categories: normalizeCategories(input.categories),
    createdAt: now,
    updatedAt: now,
  };
  await ensureDir(projectDir(id));
  await writeJson(projectJsonPath(id), project);
  return project;
}

export async function getProject(id: string): Promise<Project | null> {
  const raw = await readJson<Record<string, unknown>>(projectJsonPath(id));
  if (raw) return normalizeProject(raw);
  const archived = await readJson<Record<string, unknown>>(
    `${archivedProjectDir(id)}/project.json`,
  );
  return archived ? normalizeProject(archived) : null;
}

async function listFrom(root: string): Promise<Project[]> {
  if (!(await pathExists(root))) return [];
  const entries = await readdir(root, { withFileTypes: true });
  const projects: Project[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const raw = await readJson<Record<string, unknown>>(`${root}/${entry.name}/project.json`);
    if (raw) projects.push(normalizeProject(raw));
  }
  return projects;
}

export async function listProjects(
  opts: { includeArchived?: boolean } = {},
): Promise<Project[]> {
  await ensureManifest();
  const active = await listFrom(projectsRoot());
  const all = opts.includeArchived
    ? [...active, ...(await listFrom(archiveRoot()))]
    : active;
  return all.sort((a, b) => a.name.localeCompare(b.name));
}

export async function updateProject(
  id: string,
  patch: Partial<Omit<Project, "id" | "createdAt" | "schemaVersion">>,
): Promise<Project> {
  const current = await getProject(id);
  if (!current) throw new Error(`Project not found: ${id}`);
  const next: Project = {
    ...current,
    ...patch,
    ...("wipLimits" in patch ? { wipLimits: normalizeWipLimits(patch.wipLimits) } : {}),
    ...("lanePolicies" in patch
      ? { lanePolicies: normalizeLanePolicies(patch.lanePolicies) }
      : {}),
    ...("categories" in patch ? { categories: normalizeCategories(patch.categories) } : {}),
    ...("savedViews" in patch ? { savedViews: normalizeSavedViews(patch.savedViews) } : {}),
    id: current.id,
    slug: current.slug,
    createdAt: current.createdAt,
    schemaVersion: SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
  };
  const targetDir = next.status === "archived" ? archivedProjectDir(id) : projectDir(id);
  await ensureDir(targetDir);
  await writeJson(`${targetDir}/project.json`, next);
  return next;
}

/** Archive a project: flip status and move its directory under archive/. */
export async function archiveProject(id: string): Promise<Project> {
  const current = await getProject(id);
  if (!current) throw new Error(`Project not found: ${id}`);
  if (current.status === "archived") return current;

  if (await pathExists(projectDir(id))) {
    await mkdir(archiveRoot(), { recursive: true });
    await rename(projectDir(id), archivedProjectDir(id));
  }
  return updateProject(id, { status: "archived" });
}
