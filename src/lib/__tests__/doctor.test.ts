/** Doctor finds seeded corruption in a throwaway store. */

import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { diagnose } from "../../../scripts/doctor.mjs";

let root: string;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "threlmark-doctor-"));
  const pdir = join(root, "projects", "alpha");
  await mkdir(join(pdir, "items"), { recursive: true });
  await writeFile(
    join(pdir, "project.json"),
    JSON.stringify({ schemaVersion: 2, id: "alpha", name: "Alpha", slug: "alpha", status: "active" }),
  );
  // healthy item
  await writeFile(
    join(pdir, "items", "good.json"),
    JSON.stringify({ id: "good", projectId: "alpha", title: "Fine" }),
  );
  // id mismatch + wrong projectId + missing title
  await writeFile(
    join(pdir, "items", "bad.json"),
    JSON.stringify({ id: "other-id", projectId: "beta", title: "" }),
  );
  // malformed JSON
  await writeFile(join(pdir, "items", "broken.json"), "{not json");
  // board referencing a ghost
  await writeFile(
    join(pdir, "board.json"),
    JSON.stringify({ schemaVersion: 2, lanes: { idea: ["good", "ghost"], ranked: [], development: [], done: [] } }),
  );
  // dangling link
  await writeFile(
    join(root, "links.json"),
    JSON.stringify({ schemaVersion: 2, links: [{ id: "l1", from: "alpha/good", to: "alpha/missing", kind: "blocks" }] }),
  );
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("doctor", () => {
  it("finds every seeded problem and nothing on the healthy parts", async () => {
    const issues: { level: string; where: string; message: string }[] = await diagnose(root);
    const messages = issues.map((i) => `${i.level}:${i.message}`).join("\n");

    expect(messages).toContain('error:item id "other-id" does not match its file name');
    expect(messages).toContain('error:projectId "beta" does not match owning project "alpha"');
    expect(messages).toContain("error:malformed JSON");
    expect(messages).toContain('warn:lane "idea" references missing item "ghost"');
    expect(messages).toContain('warn:link l1 to → "alpha/missing" points at nothing');
    expect(messages).toContain("warn:item has no title");
    // the healthy item triggers nothing
    expect(issues.filter((i) => i.where.includes("good.json"))).toHaveLength(0);
  });

  it("reports a missing store gently", async () => {
    const empty = await mkdtemp(join(tmpdir(), "threlmark-empty-"));
    const issues: { level: string }[] = await diagnose(empty);
    expect(issues).toHaveLength(1);
    expect(issues[0].level).toBe("warn");
    await rm(empty, { recursive: true, force: true });
  });
});
