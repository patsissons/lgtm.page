import { describe, expect, it } from "vitest";
import {
  apps,
  appsVersion,
  pageOf,
  registryVersion,
  siteFile,
  sites,
} from "./apps";

/**
 * Top-level paths the index already answers: its API, the broker's dev
 * mount, the www host, built assets and public/ pages (privacy.html is
 * also served at /privacy). A site slug is both a path and a subdomain.
 */
const RESERVED = ["api", "auth", "www", "assets", "privacy"];

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

  it("serves every site from a DNS-safe, unreserved slug over https", () => {
    for (const [slug, { site }] of sites) {
      expect(slug).toMatch(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/);
      expect(RESERVED).not.toContain(slug);
      expect(new URL(site).protocol).toBe("https:");
    }
    expect([...sites.keys()]).toEqual(
      slugs.filter((slug) => apps.find((a) => a.slug === slug)!.site),
    );
  });

  it("maps a site's paths to files under its source", () => {
    const site = "https://raw.githubusercontent.com/x/a/refs/heads/main/site";
    expect(siteFile(site, "/")).toBe(`${site}/index.html`);
    expect(siteFile(`${site}/`, "")).toBe(`${site}/index.html`);
    expect(siteFile(site, "/docs/")).toBe(`${site}/docs/index.html`);
    expect(siteFile(site, "/css/a.css")).toBe(`${site}/css/a.css`);
    expect(siteFile(site, "//b.png")).toBe(`${site}/b.png`);
    expect(siteFile(site, "/../secret")).toBeNull();
    expect(siteFile(site, "/%2e%2e/secret")).toBeNull();
    expect(siteFile(site, "/\\\\evil.example/x")).toBeNull();
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
    expect(
      pageOf({
        slug: "c",
        site: "https://example.com/c",
        repo: "https://github.com/x/c",
      }),
    ).toBe("https://c.lgtm.page/");
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
