import { describe, expect, it } from "vitest";
import type { AppCard } from "@shared/types";
import { DEFAULT_SORT, orderLabel, sortApps } from "./sort-apps";

const card = (
  slug: string,
  title: string,
  created: string,
  updated = created,
): AppCard => ({
  slug,
  url: `https://${slug}.lgtm.page/`,
  host: `${slug}.lgtm.page`,
  title,
  created,
  updated,
  status: "ok",
});

const APPS = [
  card("b", "beta", "2026-01-01T00:00:00Z", "2026-03-01T00:00:00Z"),
  card("a", "Alpha", "2026-02-01T00:00:00Z"),
  card("c", "Ápex", "2026-01-15T00:00:00Z", "2026-02-01T00:00:00Z"),
  card("d", "delta", "2026-01-15T00:00:00Z", "2026-02-01T00:00:00Z"),
];
const slugs = (apps: AppCard[]) => apps.map((app) => app.slug);

describe("sortApps", () => {
  it("defaults to the most recently updated first", () => {
    expect(DEFAULT_SORT).toEqual({ key: "updated", order: "desc" });
    // a, c and d were updated at the same moment, so they stay A to Z.
    expect(slugs(sortApps(APPS, DEFAULT_SORT))).toEqual(["b", "a", "c", "d"]);
  });

  it("sorts by update time oldest first, ties still A to Z", () => {
    expect(slugs(sortApps(APPS, { key: "updated", order: "asc" }))).toEqual([
      "a",
      "c",
      "d",
      "b",
    ]);
  });

  it("sorts by creation time either way", () => {
    expect(slugs(sortApps(APPS, { key: "created", order: "desc" }))).toEqual([
      "a",
      "c",
      "d",
      "b",
    ]);
    expect(slugs(sortApps(APPS, { key: "created", order: "asc" }))).toEqual([
      "b",
      "c",
      "d",
      "a",
    ]);
  });

  it("sorts by title ignoring case and accents", () => {
    expect(slugs(sortApps(APPS, { key: "title", order: "asc" }))).toEqual([
      "a",
      "c",
      "b",
      "d",
    ]);
    expect(slugs(sortApps(APPS, { key: "title", order: "desc" }))).toEqual([
      "d",
      "b",
      "c",
      "a",
    ]);
  });

  it("compares instants, not strings", () => {
    const apps = [
      card("x", "X", "2026-01-01T10:00:00Z"),
      card("y", "Y", "2026-01-01T09:00:00-02:00"),
    ];
    expect(slugs(sortApps(apps, DEFAULT_SORT))).toEqual(["y", "x"]);
  });

  it("leaves its input alone", () => {
    const before = [...APPS];
    sortApps(APPS, DEFAULT_SORT);
    expect(APPS).toEqual(before);
  });
});

describe("orderLabel", () => {
  it("reads dates as newest/oldest and titles as A to Z", () => {
    expect(orderLabel("updated", "desc")).toBe("Newest first");
    expect(orderLabel("created", "asc")).toBe("Oldest first");
    expect(orderLabel("title", "asc")).toBe("A to Z");
    expect(orderLabel("title", "desc")).toBe("Z to A");
  });
});
