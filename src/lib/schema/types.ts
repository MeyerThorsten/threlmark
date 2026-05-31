/**
 * The Threlmark data contract. These types describe exactly what lives on disk.
 * External tools (IdeaClyst, ChannelHelm, …) read/write these same shapes.
 */

export const SCHEMA_VERSION = 2;

/** Kanban lanes, in display order. A lane id is also the item `status`. */
export const LANES = ["idea", "ranked", "development", "done"] as const;
export type Lane = (typeof LANES)[number];
export type Status = Lane;

/** Agents that work items can be handed off to. */
export const AGENTS = ["claude", "codex", "other"] as const;
export type Agent = (typeof AGENTS)[number];

/** Default age thresholds (ms) past which an item in a lane is "stale". */
export const STALE_THRESHOLDS_MS: Record<Lane, number> = {
  idea: 60 * 24 * 3600 * 1000,
  ranked: 21 * 24 * 3600 * 1000,
  development: 7 * 24 * 3600 * 1000,
  done: Number.POSITIVE_INFINITY,
};

/** A handed-off item is "stalled" if not Done this long after the handoff. */
export const STALLED_BRIEF_MS = 7 * 24 * 3600 * 1000;

export const LANE_LABELS: Record<Lane, string> = {
  idea: "Ideas",
  ranked: "Ranked",
  development: "Development",
  done: "Done",
};

export const CATEGORIES = [
  "Research",
  "Discovery",
  "Reports",
  "Trends",
  "Validation",
  "Build",
  "Distribution",
  "Operations",
  "UX",
  "Automation",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const LINK_KINDS = ["blocks", "relates", "duplicates"] as const;
export type LinkKind = (typeof LINK_KINDS)[number];

/** Root manifest at <root>/threlmark.json */
export interface Manifest {
  schemaVersion: number;
  createdAt: string;
  updatedAt: string;
}

/** <root>/projects/<id>/project.json */
export interface Project {
  schemaVersion: number;
  id: string;
  name: string;
  slug: string;
  description?: string;
  /** Absolute path to the app's repo, used to scope handoff briefs. */
  repoPath?: string;
  /** Accent colour for portfolio/UI. */
  color?: string;
  status: "active" | "archived";
  /** Work-in-progress limits per lane (flow management). */
  wipLimits?: Partial<Record<Lane, number>>;
  /** Short explicit policy per lane (Definition of Workflow). */
  lanePolicies?: Partial<Record<Lane, string>>;
  createdAt: string;
  updatedAt: string;
}

/** One lane transition in an item's history (append-only). */
export interface Transition {
  to: Status;
  at: string;
}

/** Records that an item was handed to an agent via a brief. */
export interface HandoffStamp {
  handoffId: string;
  agent: Agent;
  at: string;
}

/** Status an agent reports back while/after working an item. */
export const REPORT_STATUSES = ["started", "done", "blocked", "failed"] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

/** An automatic progress/result report posted by an agent. */
export interface AgentReport {
  at: string;
  agent: Agent;
  status: ReportStatus;
  summary: string;
  verification?: string;
}

export const COMMENT_KINDS = ["comment", "decision"] as const;
export type CommentKind = (typeof COMMENT_KINDS)[number];

/** Append-only local notes attached to an item. */
export interface ItemComment {
  schemaVersion: number;
  id: string;
  projectId: string;
  itemId: string;
  kind: CommentKind;
  body: string;
  author?: string;
  createdAt: string;
}

/**
 * A roadmap card. Imports the roadmap.html `defaults` shape exactly. `priority`
 * is never stored — it is computed on read so it can never drift from the axes.
 */
export interface RoadmapItem {
  schemaVersion: number;
  id: string;
  projectId: string;
  title: string;
  category: Category;
  status: Status;
  impact: number; // 1-5
  evidence: number; // 1-5
  fit: number; // 1-5
  effort: number; // 1-5
  description: string;
  /** Comma-separated target files (verbatim seed shape). */
  files: string;
  acceptance: string[];
  /** Free-form labels for filtering and grouping cards. */
  labels?: string[];
  /** Optional YYYY-MM-DD date used for due/overdue scheduling. */
  dueDate?: string;
  /** Optional YYYY-MM-DD date for planned work start. */
  scheduledFor?: string;
  /** Producing tool when accepted from a suggestion, e.g. "ideaclyst". */
  source?: string;
  /** If set ("shared/<itemId>"), this is a local pointer to a shared item. */
  sharedRef?: string;
  /** Append-only lane history; powers age/cycle-time/throughput metrics. */
  transitions: Transition[];
  /** Set when the item was handed to an agent via a brief. */
  handoff?: HandoffStamp;
  /** Automatic status/result reports posted by agents. */
  reports?: AgentReport[];
  createdAt: string;
  updatedAt: string;
  /** Unknown keys are preserved on read-merge-write for forward-compat. */
  [extra: string]: unknown;
}

/** A roadmap item enriched with its computed priority (never persisted). */
export type RoadmapItemView = RoadmapItem & { priority: number };

/** <root>/projects/<id>/board.json */
export interface Board {
  schemaVersion: number;
  lanes: Record<Lane, string[]>;
  updatedAt: string;
}

/**
 * What an external tool drops into projects/<id>/suggestions/<sugId>.json.
 * Only `source` and `title` are required; everything else is defaulted on read.
 */
export interface Suggestion {
  schemaVersion?: number;
  id?: string;
  source: string;
  title: string;
  description?: string;
  category?: string;
  impact?: number;
  evidence?: number;
  fit?: number;
  effort?: number;
  files?: string;
  acceptance?: string[];
  /** Free-form labels copied onto the accepted roadmap item. */
  labels?: string[];
  /** If set, accept promotes the item into THAT project (cross-project). */
  targetProjectId?: string;
  createdAt?: string;
  [extra: string]: unknown;
}

/** A pending suggestion as surfaced in the Inbox (id + owning project resolved). */
export interface SuggestionView extends Suggestion {
  id: string;
  projectId: string;
}

/** A cross-project link/dependency edge. */
export interface Link {
  id: string;
  /** Global address `projectId/itemId`. */
  from: string;
  /** Global address (`projectId/itemId` or `shared/<itemId>`). */
  to: string;
  kind: LinkKind;
  note?: string;
  createdAt: string;
}

/** <root>/links.json */
export interface LinksFile {
  schemaVersion: number;
  links: Link[];
  updatedAt: string;
}

/** An entry in the cross-project portfolio ranking. */
export interface PortfolioEntry {
  item: RoadmapItemView;
  projectName: string;
  projectColor?: string;
  /** priority * statusWeight, plus a small bottleneck boost. */
  score: number;
  /** Number of items this one blocks (drives the bottleneck flag). */
  blocks: number;
}

export interface Portfolio {
  entries: PortfolioEntry[];
  links: Link[];
  generatedAt: string;
}

/** A recorded handoff batch: <root>/projects/<id>/handoffs/<id>.json */
export interface HandoffRecord {
  schemaVersion: number;
  id: string;
  projectId: string;
  agent: Agent;
  format: string;
  itemIds: string[];
  note?: string;
  createdAt: string;
}

/** An aging work item surfaced in the flow view. */
export interface AgingItem {
  id: string;
  title: string;
  projectId?: string;
  projectName?: string;
  status: Status;
  ageMs: number;
  stale: boolean;
  dueDate?: string;
  overdue: boolean;
}

/** A handed-off item still not shipped. */
export interface StalledBrief {
  id: string;
  title: string;
  projectId?: string;
  projectName?: string;
  agent: Agent;
  ageMs: number;
}

/** One bucket of the throughput series (items finished in a week). */
export interface ThroughputBucket {
  weekStart: string;
  count: number;
}

/** Flow metrics for one project (or, aggregated, the whole portfolio). */
export interface FlowMetrics {
  /** Current count per lane. */
  wip: Record<Lane, number>;
  /** Lanes currently over their configured WIP limit. */
  overLimit: Partial<Record<Lane, { count: number; limit: number }>>;
  /** Median + samples of cycle time (development → done), in ms. */
  cycleTimeMedianMs: number | null;
  cycleTimeSamples: number;
  /** Items entering Done per ISO week (most recent last). */
  throughput: ThroughputBucket[];
  /** Items finished per week, grouped by agent (handed-off only). */
  agentThroughput: { agent: Agent; weeks: ThroughputBucket[]; total: number }[];
  /** Active items sorted oldest-in-lane first. */
  aging: AgingItem[];
  /** Handed-off items not yet Done past the stall threshold. */
  stalled: StalledBrief[];
}

export interface ProjectFlow extends FlowMetrics {
  projectId: string;
  wipLimits: Partial<Record<Lane, number>>;
}

export interface PortfolioFlow extends FlowMetrics {
  generatedAt: string;
  projectCount: number;
}
