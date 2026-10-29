import type { AppEntry } from "./types";

/**
 * Every app in the index, alphabetical by slug. Apps can live on any domain.
 * Adding an app is one line: its card's title, description and image come
 * from the app's own Open Graph tags, fetched live by the Worker
 * (worker/api.ts).
 */
export const apps: readonly AppEntry[] = [
  {
    slug: "aidios",
    url: "https://aidiosplayer.com/",
    repo: "https://github.com/patsissons/aidios",
  },
  {
    slug: "bazillion",
    url: "https://bazillion.lgtm.page/",
    repo: "https://github.com/patsissons/bazillion",
  },
  {
    slug: "bocodds",
    url: "https://bocodds.com/",
    repo: "https://github.com/patsissons/bocodds",
  },
  {
    slug: "chowda",
    url: "https://chowda.app/",
    repo: "https://github.com/patsissons/chowda",
  },
  {
    slug: "covac",
    url: "https://covac.fyi/",
    repo: "https://github.com/patsissons/covac",
  },
  {
    slug: "cubby",
    url: "https://cubby.pockethost.io/",
    repo: "https://github.com/patsissons/cubby",
  },
  {
    slug: "daythatworks",
    url: "https://daythatworks.com/",
    repo: "https://github.com/patsissons/daythatworks",
  },
  {
    slug: "jeoprompty",
    url: "https://jeoprompty.com/",
    repo: "https://github.com/patsissons/jeoprompty",
  },
  {
    slug: "prismy",
    url: "https://prismy.lgtm.page/",
    repo: "https://github.com/patsissons/prismy",
  },
  {
    slug: "saucedapple",
    url: "https://saucedapple.com/",
    repo: "https://github.com/patsissons/saucedapple",
  },
  {
    slug: "stacky",
    url: "https://stacky.lgtm.page/",
    repo: "https://github.com/patsissons/stacky",
  },
  {
    slug: "take5",
    url: "https://take5.lgtm.page/",
    repo: "https://github.com/patsissons/take5",
  },
  {
    slug: "voting",
    url: "https://voting.lgtm.page/",
    repo: "https://github.com/patsissons/voting",
  },
  {
    slug: "wavelength",
    url: "https://wavelength.lgtm.page/",
    repo: "https://github.com/patsissons/wavelength",
  },
];

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
