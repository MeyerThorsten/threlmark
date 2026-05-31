import { slugify } from "../ids";
import { upsertSuggestion } from "../suggestions/store";
import type { SuggestionView } from "../schema/types";

type GitHubLabel = string | { name?: string | null };
type GitHubIssue = {
  id?: number | string;
  node_id?: string;
  number?: number;
  title?: string;
  body?: string | null;
  html_url?: string;
  url?: string;
  repository_url?: string;
  state?: string;
  labels?: GitHubLabel[];
  pull_request?: unknown;
};
type GitHubProjectItem = {
  id?: string;
  title?: string;
  body?: string | null;
  content?: GitHubIssue & { title?: string; body?: string | null; url?: string };
  fieldValues?: { nodes?: { name?: string; text?: string; date?: string }[] };
};

export interface GitHubImportInput {
  githubJson?: string;
  repo?: string;
  token?: string;
}

function parsePayload(json: string): unknown[] {
  const parsed = JSON.parse(json) as unknown;
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>;
    if (Array.isArray(obj.items)) return obj.items;
    if (Array.isArray(obj.nodes)) return obj.nodes;
    if (Array.isArray(obj.issues)) return obj.issues;
    if (obj.data && typeof obj.data === "object") {
      const data = obj.data as Record<string, unknown>;
      const search = data.search as { nodes?: unknown[] } | undefined;
      if (Array.isArray(search?.nodes)) return search.nodes;
      const repository = data.repository as Record<string, unknown> | undefined;
      const issues = repository?.issues as { nodes?: unknown[] } | undefined;
      if (Array.isArray(issues?.nodes)) return issues.nodes;
      const projectV2 = repository?.projectV2 as Record<string, unknown> | undefined;
      const projectItems = projectV2?.items as { nodes?: unknown[] } | undefined;
      if (Array.isArray(projectItems?.nodes)) return projectItems.nodes;
    }
  }
  throw new Error("GitHub import expects an array, `items`, `issues`, `nodes`, or a GitHub GraphQL response");
}

function labelNames(labels: unknown): string[] {
  if (!Array.isArray(labels)) return [];
  return labels
    .map((label) => (typeof label === "string" ? label : label?.name))
    .filter((label): label is string => typeof label === "string" && !!label.trim())
    .map((label) => label.trim());
}

function issueRepo(issue: GitHubIssue, fallbackRepo?: string): string | undefined {
  if (fallbackRepo) return fallbackRepo;
  if (!issue.repository_url) return undefined;
  const match = /\/repos\/([^/]+\/[^/]+)$/.exec(issue.repository_url);
  return match?.[1];
}

function normalizeIssue(raw: unknown): GitHubIssue | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as GitHubProjectItem;
  const issue = (item.content && typeof item.content === "object" ? item.content : item) as GitHubIssue;
  const title = issue.title ?? item.title;
  if (!title?.trim()) return null;
  return { ...issue, title, body: issue.body ?? item.body };
}

function suggestionId(issue: GitHubIssue, repo?: string): string {
  if (repo && typeof issue.number === "number") {
    return `github-${slugify(repo)}-${issue.number}`;
  }
  return `github-${slugify(String(issue.node_id ?? issue.id ?? issue.title))}`;
}

async function fetchIssues(repo: string, token?: string): Promise<unknown[]> {
  const headers: HeadersInit = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token?.trim()) headers.Authorization = `Bearer ${token.trim()}`;
  const res = await fetch(`https://api.github.com/repos/${repo}/issues?state=open&per_page=100`, {
    headers,
  });
  if (!res.ok) {
    throw new Error(`GitHub API failed (${res.status})`);
  }
  return (await res.json()) as unknown[];
}

export async function importGitHubSuggestions(
  projectId: string,
  input: GitHubImportInput,
): Promise<{ imported: number; suggestions: SuggestionView[] }> {
  const repo = input.repo?.trim();
  const rawItems = input.githubJson?.trim()
    ? parsePayload(input.githubJson)
    : repo
      ? await fetchIssues(repo, input.token)
      : null;

  if (!rawItems) throw new Error("Provide `githubJson` or `repo`");

  const suggestions: SuggestionView[] = [];
  for (const raw of rawItems) {
    const issue = normalizeIssue(raw);
    if (!issue || issue.pull_request) continue;
    const sourceRepo = issueRepo(issue, repo);
    const url = issue.html_url || issue.url;
    const numberText = typeof issue.number === "number" ? `#${issue.number}` : undefined;
    const description = [
      issue.body?.trim(),
      sourceRepo || numberText || url ? "" : undefined,
      sourceRepo ? `Repository: ${sourceRepo}` : undefined,
      numberText ? `Issue: ${numberText}` : undefined,
      url ? `Source: ${url}` : undefined,
    ]
      .filter((part): part is string => typeof part === "string")
      .join("\n");

    const suggestion = await upsertSuggestion(projectId, {
      id: suggestionId(issue, sourceRepo),
      source: "github",
      title: issue.title!.trim(),
      description,
      category: "Automation",
      impact: 3,
      evidence: 4,
      fit: 3,
      effort: 3,
      files: url,
      labels: [...new Set(["github", issue.state ?? "open", ...(sourceRepo ? [slugify(sourceRepo)] : []), ...labelNames(issue.labels)])],
      acceptance: ["Review linked GitHub context", "Accept or dismiss this suggestion from the Inbox"],
      sourceId: String(issue.node_id ?? issue.id ?? ""),
      sourceUrl: url,
    });
    suggestions.push(suggestion);
  }

  return { imported: suggestions.length, suggestions };
}
