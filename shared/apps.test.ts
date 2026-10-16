import { describe, expect, it } from "vitest";
import { apps } from "./apps";

describe("apps", () => {
  const slugs = apps.map((app) => app.slug);

  it("lists each app once, alphabetical by slug", () => {
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(slugs).toEqual([...slugs].sort());
  });

  it("links every app's home page over https", () => {
    for (const { url } of apps) {
      const parsed = new URL(url);
      expect(parsed.protocol).toBe("https:");
      expect(parsed.pathname).toBe("/");
      expect(parsed.href).toBe(url);
    }
  });

  it("links every repo on GitHub", () => {
    for (const { repo } of apps) {
      if (repo)
        expect(repo).toMatch(/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/);
    }
  });
});
