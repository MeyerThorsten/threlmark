/**
 * Schema versioning. Every file carries `schemaVersion`. Migrations run lazily
 * on read and persist on the next write, so there is never a big-bang migration
 * and older external tools keep working. v1 is the current contract.
 */

import { SCHEMA_VERSION } from "./types";

export { SCHEMA_VERSION };

/**
 * Bring a raw on-disk record up to the current schema version. v1 is the
 * baseline, so this is currently an identity pass that just stamps the version.
 * Future migrations slot in here keyed on the record's existing version.
 */
export function migrate<T extends Record<string, unknown>>(raw: T): T {
  const version = typeof raw.schemaVersion === "number" ? raw.schemaVersion : 1;
  // No migrations needed yet (v1 baseline). Preserve unknown keys.
  void version;
  return { ...raw, schemaVersion: SCHEMA_VERSION };
}
