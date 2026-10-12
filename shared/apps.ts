import type { AppEntry } from "./types";

/**
 * Every app on lgtm.page, in display order. Adding an app is one line: its
 * card's title, description and image come from the app's own Open Graph
 * tags, fetched live by the Worker (worker/api.ts).
 */
export const apps: readonly AppEntry[] = [
  {
    slug: "wavelength",
    url: "https://wavelength.lgtm.page/",
    repo: "https://github.com/patsissons/wavelength",
  },
];
