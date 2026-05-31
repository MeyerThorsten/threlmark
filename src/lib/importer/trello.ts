import { slugify } from "../ids";
import { upsertItem } from "../items/store";
import { writeFileAtomic } from "../fsops";
import { listItemViews } from "../items/store";
import { roadmapMarkdown } from "../markdown";
import { roadmapMdPath } from "../paths";
import type { Lane } from "../schema/types";

type TrelloLabel = { name?: string; color?: string };
type TrelloChecklist = { checkItems?: { name?: string; state?: string }[] };
type TrelloList = { id: string; name?: string; closed?: boolean };
type TrelloCard = {
  id?: string;
  idList?: string;
  name?: string;
  desc?: string;
  closed?: boolean;
  due?: string | null;
  labels?: TrelloLabel[];
  url?: string;
  shortUrl?: string;
  checklists?: TrelloChecklist[];
};
type TrelloBoard = {
  name?: string;
  lists?: TrelloList[];
  cards?: TrelloCard[];
  checklists?: (TrelloChecklist & { idCard?: string })[];
};

const LANE_MATCHERS: { lane: Lane; terms: string[] }[] = [
  { lane: "done", terms: ["done", "complete", "completed", "shipped", "closed"] },
  { lane: "development", terms: ["dev", "development", "doing", "in progress", "progress", "active"] },
  { lane: "ranked", terms: ["ranked", "ready", "next", "backlog", "priority"] },
  { lane: "idea", terms: ["idea", "ideas", "inbox", "todo", "to do"] },
];

function laneFromList(name = ""): Lane {
  const normalized = name.toLowerCase().replace(/\s+/g, " ").trim();
  for (const matcher of LANE_MATCHERS) {
    if (matcher.terms.some((term) => normalized.includes(term))) return matcher.lane;
  }
  // Unknown Trello list names land in Ideas so import never silently commits work.
  return "idea";
}

function dateOnly(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  return /^\d{4}-\d{2}-\d{2}/.exec(value)?.[0];
}

function parseBoard(json: string): TrelloBoard {
  const parsed = JSON.parse(json) as unknown;
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Trello import expects a board JSON object");
  }
  const board = parsed as TrelloBoard;
  if (!Array.isArray(board.cards) || !Array.isArray(board.lists)) {
    throw new Error("Trello import needs `cards` and `lists` arrays from a board export");
  }
  return board;
}

function cardAcceptance(card: TrelloCard, boardChecklists: TrelloBoard["checklists"]): string[] {
  const direct = card.checklists ?? [];
  const attached = boardChecklists?.filter((checklist) => checklist.idCard === card.id) ?? [];
  return [...direct, ...attached]
    .flatMap((checklist) => checklist.checkItems ?? [])
    .map((item) => item.name?.trim())
    .filter((name): name is string => !!name);
}

export async function importTrelloJson(
  projectId: string,
  json: string,
): Promise<{ imported: number }> {
  const board = parseBoard(json);
  const lists = new Map((board.lists ?? []).map((list) => [list.id, list]));
  let imported = 0;

  for (const card of board.cards ?? []) {
    if (!card.id || !card.name?.trim() || card.closed) continue;
    const list = card.idList ? lists.get(card.idList) : undefined;
    const listName = list?.name ?? "Trello";
    const sourceUrl = card.url || card.shortUrl;
    const labels: string[] = [
      "trello",
      slugify(listName),
      ...(card.labels ?? [])
        .map((label) => label.name?.trim() || label.color?.trim())
        .filter((label): label is string => typeof label === "string" && !!label),
    ];

    await upsertItem(projectId, {
      id: `trello-${card.id}`,
      title: card.name.trim(),
      category: "Build",
      status: laneFromList(listName),
      impact: 3,
      evidence: 3,
      fit: 3,
      effort: 3,
      description: card.desc?.trim() || "",
      files: sourceUrl ?? "",
      acceptance: cardAcceptance(card, board.checklists),
      labels: [...new Set(labels)],
      dueDate: dateOnly(card.due),
      source: "trello",
      sourceId: card.id,
      sourceUrl,
    });
    imported++;
  }

  const items = await listItemViews(projectId);
  await writeFileAtomic(roadmapMdPath(projectId), roadmapMarkdown(projectId, items));
  return { imported };
}
