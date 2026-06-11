/**
 * Event bus: webhooks + local automation rules.
 *
 * Configuration is ONE optional file, `<root>/automations.json` — same
 * plain-JSON contract as everything else, editable by hand or by other tools:
 *
 *   {
 *     "webhooks": [
 *       { "url": "https://example.test/hook", "events": ["item.done", "report.received"] }
 *     ],
 *     "rules": [
 *       { "on": "item.moved", "toLane": "development", "addLabels": ["wip"] }
 *     ]
 *   }
 *
 * `emitEvent` is called from the stores after a mutation. It must never throw
 * and never slow a request down: rules (label additions) are applied inline
 * (they're local file writes), webhook deliveries are fire-and-forget with a
 * timeout, and every delivery attempt is appended to `<root>/events.log`
 * (JSONL) so the trail is inspectable.
 */

import { appendFile } from "node:fs/promises";
import { join } from "node:path";

import { readJson } from "./fsops";
import { readItem, writeItem } from "./items/io";
import { dataRoot } from "./paths";
import type { RoadmapItem } from "./schema/types";

export const EVENT_TYPES = [
  "item.created",
  "item.moved",
  "item.done",
  "report.received",
  "handoff.recorded",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export interface ThrelmarkEvent {
  type: EventType;
  at: string;
  projectId: string;
  itemId?: string;
  /** Item snapshot at emit time (when the event concerns an item). */
  item?: Pick<RoadmapItem, "id" | "title" | "status" | "category" | "labels">;
  /** Event-specific extras (toLane, agent, reportStatus, handoffId, …). */
  data?: Record<string, unknown>;
}

export interface WebhookConfig {
  url: string;
  /** Event types to deliver; omit or ["*"] for all. */
  events?: string[];
}

export interface AutomationRule {
  /** Event type to react to, or "*". */
  on: string;
  /** Only when the item ended up in this lane. */
  toLane?: string;
  /** Only when the item carries this label. */
  ifLabel?: string;
  /** Only for this project. */
  projectId?: string;
  /** Labels to add to the item. */
  addLabels?: string[];
}

export interface AutomationsConfig {
  webhooks: WebhookConfig[];
  rules: AutomationRule[];
}

export const automationsPath = () => join(dataRoot(), "automations.json");
export const eventsLogPath = () => join(dataRoot(), "events.log");

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

export async function loadAutomations(): Promise<AutomationsConfig> {
  const raw = await readJson<Record<string, unknown>>(automationsPath());
  if (!raw) return { webhooks: [], rules: [] };
  const webhooks = asArray<Record<string, unknown>>(raw.webhooks)
    .filter((w) => typeof w?.url === "string" && w.url.trim())
    .map((w) => ({
      url: (w.url as string).trim(),
      events: asArray<string>(w.events).filter((e) => typeof e === "string"),
    }));
  const rules = asArray<Record<string, unknown>>(raw.rules)
    .filter((r) => typeof r?.on === "string" && r.on.trim())
    .map((r) => ({
      on: (r.on as string).trim(),
      toLane: typeof r.toLane === "string" ? r.toLane : undefined,
      ifLabel: typeof r.ifLabel === "string" ? r.ifLabel : undefined,
      projectId: typeof r.projectId === "string" ? r.projectId : undefined,
      addLabels: asArray<string>(r.addLabels).filter(
        (l) => typeof l === "string" && l.trim(),
      ),
    }));
  return { webhooks, rules };
}

/** Does this webhook subscribe to the event? (no list / "*" = everything) */
export function webhookMatches(hook: WebhookConfig, type: string): boolean {
  return !hook.events?.length || hook.events.includes("*") || hook.events.includes(type);
}

/** Pure rule matcher: which labels should this event add to its item? */
export function applyRules(rules: AutomationRule[], event: ThrelmarkEvent): string[] {
  const labels = new Set<string>();
  for (const rule of rules) {
    if (rule.on !== "*" && rule.on !== event.type) continue;
    if (rule.projectId && rule.projectId !== event.projectId) continue;
    if (rule.toLane && rule.toLane !== event.item?.status) continue;
    if (rule.ifLabel && !(event.item?.labels ?? []).includes(rule.ifLabel)) continue;
    for (const label of rule.addLabels ?? []) {
      const trimmed = label.trim();
      if (trimmed && !(event.item?.labels ?? []).includes(trimmed)) labels.add(trimmed);
    }
  }
  return [...labels];
}

type FetchLike = (url: string, init: RequestInit) => Promise<{ status: number }>;

async function logLine(entry: Record<string, unknown>): Promise<void> {
  await appendFile(eventsLogPath(), JSON.stringify(entry) + "\n", "utf8").catch(() => {});
}

/** Deliver to all subscribed webhooks; never throws, logs every attempt. */
export async function deliverWebhooks(
  webhooks: WebhookConfig[],
  event: ThrelmarkEvent,
  fetchImpl: FetchLike = fetch,
): Promise<void> {
  await Promise.all(
    webhooks.filter((hook) => webhookMatches(hook, event.type)).map(async (hook) => {
      try {
        const res = await fetchImpl(hook.url, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Threlmark-Event": event.type },
          body: JSON.stringify(event),
          signal: AbortSignal.timeout(3000),
        });
        await logLine({ at: event.at, type: event.type, url: hook.url, status: res.status });
      } catch (err) {
        await logLine({
          at: event.at,
          type: event.type,
          url: hook.url,
          error: err instanceof Error ? err.message : "delivery failed",
        });
      }
    }),
  );
}

/**
 * Emit one event: apply automation rules inline (local writes, deterministic),
 * fire webhooks in the background. Never throws — automations must not be able
 * to break a board mutation.
 */
export async function emitEvent(event: ThrelmarkEvent): Promise<void> {
  try {
    const config = await loadAutomations();
    if (!config.webhooks.length && !config.rules.length) return;

    const addLabels = applyRules(config.rules, event);
    if (addLabels.length && event.itemId) {
      const item = await readItem(event.projectId, event.itemId);
      if (item) {
        item.labels = [...new Set([...(item.labels ?? []), ...addLabels])];
        item.updatedAt = new Date().toISOString();
        await writeItem(item);
        await logLine({ at: event.at, type: event.type, itemId: event.itemId, addedLabels: addLabels });
      }
    }

    if (config.webhooks.length) {
      // Fire-and-forget: a slow endpoint must not slow the board.
      void deliverWebhooks(config.webhooks, event);
    }
  } catch {
    /* automations never break a mutation */
  }
}

/** Compact item snapshot for event payloads. */
export function eventItem(item: RoadmapItem): ThrelmarkEvent["item"] {
  return {
    id: item.id,
    title: item.title,
    status: item.status,
    category: item.category,
    labels: item.labels,
  };
}
