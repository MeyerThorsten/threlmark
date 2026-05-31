/** Root manifest bootstrap. Ensures <root>/threlmark.json exists. */

import { readJson, writeJson } from "./fsops";
import { manifestPath } from "./paths";
import { SCHEMA_VERSION, type Manifest } from "./schema/types";

export async function ensureManifest(): Promise<Manifest> {
  const existing = await readJson<Manifest>(manifestPath());
  if (existing) return existing;
  const now = new Date().toISOString();
  const manifest: Manifest = {
    schemaVersion: SCHEMA_VERSION,
    createdAt: now,
    updatedAt: now,
  };
  await writeJson(manifestPath(), manifest);
  return manifest;
}
