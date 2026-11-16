import { describe, expect, it } from "vitest";
import { apps, appsVersion, pageOf, registryVersion } from "./apps";

describe("apps", () => {
  const slugs = apps.map((app) => app.slug);

  it("lists each app once, alphabetical by slug", () => {
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(slugs).toEqual([...slugs].sort());
  });

  it("links every hosted app's home page over https", () => {
    for (const { url } of apps) {
      if (url === undefined) continue;
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

  it("gives every app a page: its home page, else its repo", () => {
    expect(
      pageOf({
        slug: "a",
        url: "https://a.lgtm.page/",
        repo: "https://github.com/x/a",
      }),
    ).toBe("https://a.lgtm.page/");
    expect(pageOf({ slug: "b", repo: "https://github.com/x/b" })).toBe(
      "https://github.com/x/b",
    );
    for (const app of apps) expect(pageOf(app)).toMatch(/^https:\/\//);
  });

  it("fingerprints the registry", () => {
    expect(appsVersion).toMatch(/^[0-9a-z]+$/);
    expect(registryVersion(apps)).toBe(appsVersion);
    expect(registryVersion(apps.slice(1))).not.toBe(appsVersion);
    const [first, ...rest] = apps;
    expect(registryVersion([{ ...first!, title: "New" }, ...rest])).not.toBe(
      appsVersion,
    );
  });
});
