/** ID + address helpers. Mirrors IdeaClyst's sortable `<ts>-<slug>-<rand>` ids. */

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "item";
}

function rand(len: number): string {
  let out = "";
  while (out.length < len) out += Math.random().toString(36).slice(2);
  return out.slice(0, len);
}

/** Sortable, collision-resistant id: `<timestampMs>-<slug>-<rand6>`. */
export function makeId(label: string): string {
  return `${Date.now()}-${slugify(label)}-${rand(6)}`;
}

/** Short random suffix used to disambiguate project slugs on collision. */
export function shortRand(): string {
  return rand(4);
}

/** Build a global cross-project address. */
export function makeAddress(projectId: string, itemId: string): string {
  return `${projectId}/${itemId}`;
}

/** Parse `<projectId>/<itemId>` (or `shared/<itemId>`) into its parts. */
export function parseAddress(
  address: string,
): { projectId: string; itemId: string } {
  const slash = address.indexOf("/");
  if (slash === -1) {
    throw new Error(`Invalid address: ${address}`);
  }
  return {
    projectId: address.slice(0, slash),
    itemId: address.slice(slash + 1),
  };
}
