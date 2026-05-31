/**
 * Tolerant normalization. Reading any record from disk defaults missing fields
 * and clamps invalid ones so a malformed external write never crashes the app.
 * Unknown keys are preserved (forward-compat).
 */

import {
  AGENTS,
  CATEGORIES,
  LANES,
  REPORT_STATUSES,
  SCHEMA_VERSION,
  type Agent,
  type AgentReport,
  type Category,
  type HandoffStamp,
  type ReportStatus,
  type RoadmapItem,
  type Status,
  type Suggestion,
  type Transition,
} from "./types";

function clampScore(n: unknown, fallback: number): number {
  const v = typeof n === "number" && Number.isFinite(n) ? Math.round(n) : fallback;
  return Math.min(5, Math.max(1, v));
}

export function toCategory(value: unknown): Category {
  return CATEGORIES.includes(value as Category) ? (value as Category) : "Build";
}

export function toStatus(value: unknown): Status {
  return LANES.includes(value as Status) ? (value as Status) : "idea";
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}

function toAgent(value: unknown): Agent {
  return AGENTS.includes(value as Agent) ? (value as Agent) : "other";
}

/** Normalize the transition history; seed one entry for legacy (v1) items. */
function normalizeTransitions(
  value: unknown,
  status: Status,
  createdAt: string,
): Transition[] {
  if (Array.isArray(value)) {
    const out = value
      .filter((t): t is Record<string, unknown> => !!t && typeof t === "object")
      .filter((t) => LANES.includes(t.to as Status) && typeof t.at === "string")
      .map((t) => ({ to: t.to as Status, at: t.at as string }));
    if (out.length) return out;
  }
  // Legacy item with no history: seed it from creation + current status.
  return [{ to: status, at: createdAt }];
}

function normalizeHandoff(value: unknown): HandoffStamp | undefined {
  if (!value || typeof value !== "object") return undefined;
  const h = value as Record<string, unknown>;
  if (typeof h.handoffId !== "string" || typeof h.at !== "string") return undefined;
  return { handoffId: h.handoffId, agent: toAgent(h.agent), at: h.at };
}

export function toReportStatus(value: unknown): ReportStatus {
  return REPORT_STATUSES.includes(value as ReportStatus) ? (value as ReportStatus) : "started";
}

function normalizeReports(value: unknown): AgentReport[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out = value
    .filter((r): r is Record<string, unknown> => !!r && typeof r === "object")
    .map((r) => ({
      at: typeof r.at === "string" ? r.at : new Date().toISOString(),
      agent: toAgent(r.agent),
      status: toReportStatus(r.status),
      summary: typeof r.summary === "string" ? r.summary : "",
      verification: typeof r.verification === "string" ? r.verification : undefined,
    }));
  return out.length ? out : undefined;
}

/** Normalize a raw roadmap item record into a complete, valid RoadmapItem. */
export function normalizeItem(
  raw: Record<string, unknown>,
  projectId: string,
  now: string,
): RoadmapItem {
  const {
    id: _id,
    title: _title,
    category: _cat,
    status: _status,
    impact: _impact,
    evidence: _evidence,
    fit: _fit,
    effort: _effort,
    description: _desc,
    files: _files,
    acceptance: _acc,
    transitions: _trans,
    handoff: _handoff,
    reports: _reports,
    createdAt: _created,
    updatedAt: _updated,
    ...rest
  } = raw;

  const status = toStatus(_status);
  const createdAt = typeof _created === "string" ? _created : now;

  return {
    ...rest,
    schemaVersion: SCHEMA_VERSION,
    id: typeof _id === "string" ? _id : "",
    projectId,
    title: typeof _title === "string" ? _title : "Untitled",
    category: toCategory(_cat),
    status,
    impact: clampScore(_impact, 4),
    evidence: clampScore(_evidence, 3),
    fit: clampScore(_fit, 4),
    effort: clampScore(_effort, 3),
    description: typeof _desc === "string" ? _desc : "",
    files: typeof _files === "string" ? _files : "",
    acceptance: toStringArray(_acc),
    source: typeof raw.source === "string" ? raw.source : undefined,
    sharedRef: typeof raw.sharedRef === "string" ? raw.sharedRef : undefined,
    transitions: normalizeTransitions(_trans, status, createdAt),
    handoff: normalizeHandoff(_handoff),
    reports: normalizeReports(_reports),
    createdAt,
    updatedAt: typeof _updated === "string" ? _updated : now,
  };
}

/** Normalize a raw suggestion drop. Only `source` + `title` are meaningful. */
export function normalizeSuggestion(
  raw: Record<string, unknown>,
  id: string,
  now: string,
): Suggestion {
  return {
    ...raw,
    schemaVersion: SCHEMA_VERSION,
    id,
    source: typeof raw.source === "string" ? raw.source : "unknown",
    title: typeof raw.title === "string" ? raw.title : "Untitled suggestion",
    description: typeof raw.description === "string" ? raw.description : "",
    category: toCategory(raw.category),
    impact: clampScore(raw.impact, 3),
    evidence: clampScore(raw.evidence, 3),
    fit: clampScore(raw.fit, 3),
    effort: clampScore(raw.effort, 3),
    files: typeof raw.files === "string" ? raw.files : "",
    acceptance: toStringArray(raw.acceptance),
    targetProjectId:
      typeof raw.targetProjectId === "string" ? raw.targetProjectId : undefined,
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : now,
  };
}
