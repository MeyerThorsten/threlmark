#!/usr/bin/env node
/**
 * Threlmark MCP server — the board as first-class agent tools over stdio.
 * Thin proxy onto the running app's HTTP API, so it shares every store rule
 * (normalization, events, board reconciliation) with the UI.
 *
 *   { "mcpServers": { "threlmark": {
 *       "command": "node",
 *       "args": ["scripts/threlmark-mcp.mjs"],
 *       "env": { "THRELMARK_URL": "http://localhost:4789" } } } }
 *
 * THRELMARK_URL defaults to http://localhost:3000 (the `next dev` default).
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const BASE = (process.env.THRELMARK_URL || "http://localhost:3000").replace(/\/$/, "");

async function call(path, method = "GET", body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    let message = text;
    try {
      message = JSON.parse(text).error ?? text;
    } catch { /* keep raw */ }
    throw new Error(`Threlmark API ${res.status}: ${message}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

const asText = (data) => ({
  content: [{ type: "text", text: typeof data === "string" ? data : JSON.stringify(data, null, 2) }],
});

const server = new McpServer({ name: "threlmark", version: "1.0.0" });

const LANES = ["idea", "ranked", "development", "done"];

server.registerTool(
  "list_projects",
  { description: "List all active Threlmark projects (id, name, description, lanes config)." },
  async () => asText(await call("/api/projects")),
);

server.registerTool(
  "list_items",
  {
    description:
      "List a project's roadmap items with computed priority. Optionally filter by lane status or label.",
    inputSchema: {
      projectId: z.string(),
      status: z.enum(["idea", "ranked", "development", "done"]).optional(),
      label: z.string().optional(),
    },
  },
  async ({ projectId, status, label }) => {
    let items = await call(`/api/projects/${encodeURIComponent(projectId)}/items`);
    if (status) items = items.filter((it) => it.status === status);
    if (label) items = items.filter((it) => (it.labels ?? []).includes(label));
    return asText(items);
  },
);

server.registerTool(
  "create_item",
  {
    description:
      "Create a roadmap item. Scores are 1-5; priority = impact*3 + evidence*2 + fit*2 - effort*1.5.",
    inputSchema: {
      projectId: z.string(),
      title: z.string(),
      description: z.string().optional(),
      category: z.string().optional(),
      status: z.enum(["idea", "ranked", "development", "done"]).optional(),
      impact: z.number().min(1).max(5).optional(),
      evidence: z.number().min(1).max(5).optional(),
      fit: z.number().min(1).max(5).optional(),
      effort: z.number().min(1).max(5).optional(),
      labels: z.array(z.string()).optional(),
      files: z.string().optional(),
      acceptance: z.array(z.string()).optional(),
      dueDate: z.string().optional(),
    },
  },
  async ({ projectId, ...input }) =>
    asText(await call(`/api/projects/${encodeURIComponent(projectId)}/items`, "POST", input)),
);

server.registerTool(
  "update_item",
  {
    description: "Patch fields on an existing item (title, scores, labels, description, dueDate, outcome…).",
    inputSchema: {
      projectId: z.string(),
      itemId: z.string(),
      patch: z.record(z.string(), z.unknown()),
    },
  },
  async ({ projectId, itemId, patch }) =>
    asText(
      await call(
        `/api/projects/${encodeURIComponent(projectId)}/items/${encodeURIComponent(itemId)}`,
        "PATCH",
        patch,
      ),
    ),
);

server.registerTool(
  "move_item",
  {
    description: `Move an item to a lane (${LANES.join(", ")}). Records the transition for flow metrics.`,
    inputSchema: {
      projectId: z.string(),
      itemId: z.string(),
      toLane: z.enum(["idea", "ranked", "development", "done"]),
    },
  },
  async ({ projectId, itemId, toLane }) =>
    asText(
      await call(
        `/api/projects/${encodeURIComponent(projectId)}/items/${encodeURIComponent(itemId)}/move`,
        "POST",
        { toLane },
      ),
    ),
);

server.registerTool(
  "post_report",
  {
    description:
      "Report agent progress on an item. status 'done' auto-moves the card to Done and records the summary as its outcome.",
    inputSchema: {
      projectId: z.string(),
      itemId: z.string(),
      status: z.enum(["started", "done", "blocked", "failed"]),
      summary: z.string(),
      agent: z.enum(["claude", "codex", "other"]).optional(),
      verification: z.string().optional(),
    },
  },
  async ({ projectId, itemId, agent = "claude", ...rest }) =>
    asText(
      await call(
        `/api/projects/${encodeURIComponent(projectId)}/items/${encodeURIComponent(itemId)}/report`,
        "POST",
        { agent, ...rest },
      ),
    ),
);

server.registerTool(
  "list_suggestions",
  {
    description: "List a project's Inbox suggestions (dropped by external tools or agents).",
    inputSchema: { projectId: z.string() },
  },
  async ({ projectId }) =>
    asText(await call(`/api/projects/${encodeURIComponent(projectId)}/suggestions`)),
);

server.registerTool(
  "create_suggestion",
  {
    description:
      "Drop a scored suggestion into a project's Inbox for the human to accept or dismiss — the polite way for an agent to propose work.",
    inputSchema: {
      projectId: z.string(),
      title: z.string(),
      description: z.string().optional(),
      category: z.string().optional(),
      impact: z.number().min(1).max(5).optional(),
      evidence: z.number().min(1).max(5).optional(),
      fit: z.number().min(1).max(5).optional(),
      effort: z.number().min(1).max(5).optional(),
      labels: z.array(z.string()).optional(),
      source: z.string().optional(),
    },
  },
  async ({ projectId, source = "mcp", ...input }) =>
    asText(
      await call(`/api/projects/${encodeURIComponent(projectId)}/suggestions`, "POST", {
        source,
        ...input,
      }),
    ),
);

server.registerTool(
  "accept_suggestion",
  {
    description: "Accept an Inbox suggestion into the roadmap (optionally into a different project).",
    inputSchema: {
      projectId: z.string(),
      suggestionId: z.string(),
      targetProjectId: z.string().optional(),
    },
  },
  async ({ projectId, suggestionId, targetProjectId }) =>
    asText(
      await call(
        `/api/projects/${encodeURIComponent(projectId)}/suggestions/${encodeURIComponent(suggestionId)}/accept`,
        "POST",
        targetProjectId ? { targetProjectId } : {},
      ),
    ),
);

server.registerTool(
  "get_insights",
  {
    description:
      "Decision intelligence: severity-ranked risk register, Monte Carlo completion forecast, decision log, outcome ledger. Omit projectId for the whole portfolio.",
    inputSchema: { projectId: z.string().optional() },
  },
  async ({ projectId }) =>
    asText(
      await call(
        projectId ? `/api/projects/${encodeURIComponent(projectId)}/insights` : "/api/insights",
      ),
    ),
);

server.registerTool(
  "get_plan",
  {
    description:
      "The risk-aware 'plan my day' queue: top open items across all projects with scores and human reasons. Use this to decide what to work on.",
    inputSchema: {
      limit: z.number().min(1).max(50).optional(),
      projectId: z.string().optional(),
    },
  },
  async ({ limit = 10, projectId }) =>
    asText(
      await call(
        `/api/plan?limit=${limit}${projectId ? `&project=${encodeURIComponent(projectId)}` : ""}`,
      ),
    ),
);

server.registerTool(
  "search",
  {
    description:
      "Global search across every project: items, inbox suggestions, decision notes and recorded outcomes.",
    inputSchema: { query: z.string(), limit: z.number().min(1).max(50).optional() },
  },
  async ({ query, limit = 20 }) =>
    asText(await call(`/api/search?q=${encodeURIComponent(query)}&limit=${limit}`)),
);

await server.connect(new StdioServerTransport());
