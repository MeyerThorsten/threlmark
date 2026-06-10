/**
 * Vertical project templates. A template is pure data — a category taxonomy
 * plus suggested WIP limits and lane policies — applied once at project
 * creation. Nothing references the template afterwards; the project owns its
 * `categories`/`wipLimits`/`lanePolicies` and can edit them freely.
 */

import { CATEGORIES, type Lane } from "./schema/types";

export interface ProjectTemplate {
  id: string;
  name: string;
  tagline: string;
  categories: string[];
  wipLimits?: Partial<Record<Lane, number>>;
  lanePolicies?: Partial<Record<Lane, string>>;
}

export const PROJECT_TEMPLATES: ProjectTemplate[] = [
  {
    id: "software",
    name: "Software product",
    tagline: "Ship features with evidence-backed priorities (the classic Threlmark board).",
    categories: [...CATEGORIES],
    wipLimits: { development: 3 },
    lanePolicies: {
      idea: "Anything we might build — no commitment implied.",
      ranked: "Scoped enough to compare by priority and hand off.",
      development: "Actively being built or handed to an agent; keep small.",
    },
  },
  {
    id: "marketing-content",
    name: "Marketing & content",
    tagline: "Campaigns, channels and content pipelines from idea to published.",
    categories: [
      "Content",
      "Campaigns",
      "SEO",
      "Social",
      "Email",
      "Video",
      "Brand",
      "Partnerships",
      "Analytics",
    ],
    wipLimits: { development: 4 },
    lanePolicies: {
      idea: "Content angles, campaign concepts, channel experiments.",
      ranked: "Briefed: audience, channel and success metric are named.",
      development: "In production — drafting, recording, designing.",
      done: "Published. Record reach/conversion in the outcome.",
    },
  },
  {
    id: "business-ops",
    name: "Business operations",
    tagline: "Run the company: strategy, hiring, finance, process and vendors.",
    categories: [
      "Strategy",
      "Finance",
      "Hiring",
      "Process",
      "Legal",
      "Vendors",
      "Sales",
      "Support",
      "Tooling",
    ],
    wipLimits: { development: 3 },
    lanePolicies: {
      idea: "Operational improvements and obligations as they surface.",
      ranked: "Owner-ready: scope and decision criteria are explicit.",
      development: "Being executed now; one owner per item.",
      done: "Closed. Record the decision/result in the outcome.",
    },
  },
  {
    id: "research-trading",
    name: "Research & trading",
    tagline: "Hypothesis-driven research with honest evidence scoring.",
    categories: [
      "Hypothesis",
      "Data",
      "Backtest",
      "Risk",
      "Execution",
      "Calibration",
      "Infra",
      "Reporting",
    ],
    wipLimits: { development: 2 },
    lanePolicies: {
      idea: "Untested hypotheses. Evidence score starts low by definition.",
      ranked: "Falsifiable: data source and validation method are named.",
      development: "Being tested. Promote evidence only with results in hand.",
      done: "Validated or killed — both count. Record findings in the outcome.",
    },
  },
  {
    id: "compliance-regulated",
    name: "Compliance & regulated",
    tagline: "Audits, validations and CAPAs with a traceable decision log.",
    categories: [
      "Policy",
      "Audit",
      "Validation",
      "Documentation",
      "Training",
      "CAPA",
      "Risk",
      "Submission",
    ],
    wipLimits: { development: 3 },
    lanePolicies: {
      idea: "Findings, obligations and gaps awaiting triage.",
      ranked: "Assessed: requirement, evidence needed and due date are set.",
      development: "Remediation in progress; use decision notes for rationale.",
      done: "Closed with evidence. The outcome field is the audit trail.",
    },
  },
];

export function getTemplate(id: unknown): ProjectTemplate | undefined {
  return typeof id === "string"
    ? PROJECT_TEMPLATES.find((t) => t.id === id)
    : undefined;
}
