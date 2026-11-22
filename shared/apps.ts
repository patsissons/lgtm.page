import type { AppEntry, SiteApp } from "./types";

/**
 * Every app in the index, alphabetical by slug. Apps can live on any domain.
 * Adding an app is one line: its card's title, description and image come
 * from the app's own Open Graph tags, fetched live by the Worker
 * (worker/api.ts). A small static site is listed by `site` (the base URL
 * its files are fetched from) and served by the Worker (worker/site.ts). A
 * project with no website is listed by `repo` alone and its card is its
 * GitHub page.
 */
export const apps: readonly AppEntry[] = [
  {
    slug: "aidios",
    created: "2026-10-16T20:33:15Z",
    updated: "2026-10-16T20:33:15Z",
    url: "https://aidiosplayer.com/",
    repo: "https://github.com/patsissons/aidios",
  },
  {
    slug: "bazillion",
    created: "2026-10-29T00:28:24Z",
    updated: "2026-11-21T05:08:54Z",
    url: "https://bazillion.lgtm.page/",
    repo: "https://github.com/patsissons/bazillion",
  },
  {
    slug: "bocodds",
    created: "2026-10-16T20:33:15Z",
    updated: "2026-10-16T20:33:15Z",
    url: "https://bocodds.com/",
    repo: "https://github.com/patsissons/bocodds",
  },
  {
    slug: "chowda",
    created: "2026-10-16T20:33:15Z",
    updated: "2026-10-16T20:33:15Z",
    url: "https://chowda.app/",
    repo: "https://github.com/patsissons/chowda",
  },
  {
    slug: "chromacy",
    created: "2026-11-15T01:17:07Z",
    updated: "2026-11-15T01:17:07Z",
    url: "https://chromacy.lgtm.page/",
  },
  {
    slug: "covac",
    created: "2026-10-16T20:33:15Z",
    updated: "2026-10-16T20:33:15Z",
    url: "https://covac.fyi/",
    repo: "https://github.com/patsissons/covac",
  },
  {
    slug: "cubby",
    created: "2026-10-18T19:37:52Z",
    updated: "2026-10-18T19:37:52Z",
    url: "https://cubby.pockethost.io/",
    repo: "https://github.com/patsissons/cubby",
  },
  {
    slug: "daythatworks",
    created: "2026-10-16T20:33:15Z",
    updated: "2026-10-16T20:33:15Z",
    url: "https://daythatworks.com/",
    repo: "https://github.com/patsissons/daythatworks",
  },
  {
    slug: "health-data-relay",
    created: "2026-11-01T21:04:01Z",
    updated: "2026-11-01T21:04:01Z",
    url: "https://health-data-relay.lgtm.page/",
  },
  {
    slug: "irl.page",
    created: "2026-11-17T19:19:09Z",
    updated: "2026-11-17T19:19:09Z",
    url: "https://irl.page/",
    repo: "https://github.com/patsissons/irl.page",
  },
  {
    slug: "jeoprompty",
    created: "2026-10-16T20:33:15Z",
    updated: "2026-10-16T20:33:15Z",
    url: "https://jeoprompty.com/",
    repo: "https://github.com/patsissons/jeoprompty",
  },
  {
    slug: "macbat",
    created: "2026-11-16T23:50:03Z",
    updated: "2026-11-16T23:50:03Z",
    site: "https://raw.githubusercontent.com/patsissons/macbat/refs/heads/main/site",
    repo: "https://github.com/patsissons/macbat",
  },
  {
    slug: "prismy",
    created: "2026-10-25T20:18:22Z",
    updated: "2026-10-25T20:18:22Z",
    url: "https://prismy.lgtm.page/",
    repo: "https://github.com/patsissons/prismy",
  },
  {
    slug: "saucedapple",
    created: "2026-10-16T20:33:15Z",
    updated: "2026-10-16T20:33:15Z",
    url: "https://saucedapple.com/",
    repo: "https://github.com/patsissons/saucedapple",
  },
  {
    slug: "stacky",
    created: "2026-10-18T23:48:16Z",
    updated: "2026-10-18T23:48:16Z",
    url: "https://stacky.lgtm.page/",
    repo: "https://github.com/patsissons/stacky",
  },
  {
    slug: "take5",
    created: "2026-10-19T21:47:24Z",
    updated: "2026-10-19T21:47:24Z",
    url: "https://take5.lgtm.page/",
    repo: "https://github.com/patsissons/take5",
  },
  {
    slug: "tiki.place",
    created: "2026-10-31T04:08:33Z",
    updated: "2026-10-31T04:08:33Z",
    url: "https://tiki.place/",
    repo: "https://github.com/patsissons/tiki.place",
  },
  {
    slug: "unsleep",
    created: "2026-11-17T02:22:59Z",
    updated: "2026-11-17T02:22:59Z",
    site: "https://raw.githubusercontent.com/patsissons/unsleep/refs/heads/main/site",
    repo: "https://github.com/patsissons/unsleep",
  },
  {
    slug: "voting",
    created: "2026-10-20T23:01:44Z",
    updated: "2026-10-20T23:01:44Z",
    url: "https://voting.lgtm.page/",
    repo: "https://github.com/patsissons/voting",
  },
  {
    slug: "wavelength",
    created: "2026-10-12T20:58:43Z",
    updated: "2026-10-12T20:58:43Z",
    url: "https://wavelength.lgtm.page/",
    repo: "https://github.com/patsissons/wavelength",
  },
];

/** The domain whose subdomains serve proxied sites. */
export const SITE_DOMAIN = "lgtm.page";

/** Where a site entry is served: https://<slug>.lgtm.page */
export function siteOrigin(slug: string): string {
  return `https://${slug}.${SITE_DOMAIN}`;
}

/** The entries the Worker proxies, by slug. */
export const sites: ReadonlyMap<string, SiteApp> = new Map(
  apps.flatMap((entry) =>
    entry.site === undefined ? [] : [[entry.slug, entry] as const],
  ),
);

/**
 * The upstream URL of the file at `path` (a request path, relative to the
 * site's root) of the site at `site`: a directory means its index.html.
 * Null for a path that would leave `site`.
 */
export function siteFile(site: string, path: string): string | null {
  const base = site.endsWith("/") ? site : `${site}/`;
  let file = path.replace(/^\/+/, "");
  if (file === "" || file.endsWith("/")) file += "index.html";
  try {
    const href = new URL(file, base).href;
    return href.startsWith(base) ? href : null;
  } catch {
    return null;
  }
}

/** The page a card links to (and, unless it is a site, reads its tags from). */
export function pageOf(entry: AppEntry): string {
  if (entry.url !== undefined) return entry.url;
  if (entry.site !== undefined) return `${siteOrigin(entry.slug)}/`;
  return entry.repo;
}

/** A short, stable fingerprint (32-bit FNV-1a, base 36) of `entries`. */
export function registryVersion(entries: readonly AppEntry[]): string {
  let hash = 0x811c9dc5;
  for (const char of JSON.stringify(entries)) {
    hash ^= char.codePointAt(0)!;
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

/**
 * Changes whenever the registry does, so caches keyed on it (the edge cache
 * and the browser's copy of /api/apps) miss as soon as a deploy adds,
 * removes or edits an app.
 */
export const appsVersion = registryVersion(apps);
