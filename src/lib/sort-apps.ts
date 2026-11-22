import type { AppCard } from "@shared/types";

/** What the cards can be ordered by: the registry's stamps, or the title. */
export type SortKey = "updated" | "created" | "title";
export type SortOrder = "asc" | "desc";
export interface Sort {
  key: SortKey;
  order: SortOrder;
}

export const SORT_KEYS: readonly SortKey[] = ["updated", "created", "title"];

export const SORT_LABELS: Record<SortKey, string> = {
  updated: "Last updated",
  created: "Created",
  title: "Name",
};

/** The order a key starts in when picked: newest first, or A to Z. */
export const NATURAL_ORDER: Record<SortKey, SortOrder> = {
  updated: "desc",
  created: "desc",
  title: "asc",
};

export const DEFAULT_SORT: Sort = { key: "updated", order: "desc" };

/** How `order` reads for `key`, e.g. "Newest first" or "A to Z". */
export function orderLabel(key: SortKey, order: SortOrder): string {
  if (key === "title") return order === "asc" ? "A to Z" : "Z to A";
  return order === "asc" ? "Oldest first" : "Newest first";
}

/** Title order, ignoring case and accents; the slug settles exact ties. */
function byTitle(a: AppCard, b: AppCard): number {
  return (
    a.title.localeCompare(b.title, undefined, {
      sensitivity: "base",
      numeric: true,
    }) || a.slug.localeCompare(b.slug)
  );
}

/**
 * A sorted copy of `apps`. Apps stamped at the same moment stay A to Z
 * whichever way the dates run.
 */
export function sortApps(apps: readonly AppCard[], sort: Sort): AppCard[] {
  const sign = sort.order === "asc" ? 1 : -1;
  const { key } = sort;
  return [...apps].sort((a, b) => {
    const primary =
      key === "title" ? byTitle(a, b) : Date.parse(a[key]) - Date.parse(b[key]);
    return sign * primary || byTitle(a, b);
  });
}
