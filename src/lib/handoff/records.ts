/**
 * Handoff records make a brief a first-class flow event. Recording a handoff
 * stamps each item with `handoff:{handoffId, agent, at}` (so brief→shipped and
 * agent throughput can be measured) and writes a record file for the batch.
 */

import { readdir } from "node:fs/promises";

import { pathExists, readJson, writeJson } from "../fsops";
import { makeId } from "../ids";
import { moveLane, updateItem } from "../items/store";
import { handoffPath, handoffsDir } from "../paths";
import { migrate } from "../schema/version";
import {
  AGENTS,
  SCHEMA_VERSION,
  type Agent,
  type HandoffRecord,
} from "../schema/types";

export interface RecordHandoffInput {
  agent: string;
  format: string;
  itemIds: string[];
  note?: string;
  moveToDevelopment?: boolean;
}

function toAgent(value: unknown): Agent {
  return AGENTS.includes(value as Agent) ? (value as Agent) : "other";
}

export async function recordHandoff(
  projectId: string,
  input: RecordHandoffInput,
): Promise<HandoffRecord> {
  const agent = toAgent(input.agent);
  const now = new Date().toISOString();
  const id = makeId(`handoff-${agent}`);

  for (const itemId of input.itemIds) {
    await updateItem(projectId, itemId, { handoff: { handoffId: id, agent, at: now } });
    if (input.moveToDevelopment) {
      await moveLane(projectId, itemId, "development").catch(() => {});
    }
  }

  const record: HandoffRecord = {
    schemaVersion: SCHEMA_VERSION,
    id,
    projectId,
    agent,
    format: input.format || "markdown",
    itemIds: input.itemIds,
    note: input.note?.trim() || undefined,
    createdAt: now,
  };
  await writeJson(handoffPath(projectId, id), record);
  return record;
}

export async function listHandoffs(projectId: string): Promise<HandoffRecord[]> {
  const dir = handoffsDir(projectId);
  if (!(await pathExists(dir))) return [];
  const files = await readdir(dir);
  const out: HandoffRecord[] = [];
  for (const f of files) {
    if (!f.endsWith(".json")) continue;
    const raw = await readJson<Record<string, unknown>>(`${dir}/${f}`);
    if (raw) out.push(migrate(raw) as unknown as HandoffRecord);
  }
  return out.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
}
