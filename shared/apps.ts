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
    url: "https://cubby.fyi/",
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
    slug: "wavelength",
    url: "https://wavelength.lgtm.page/",
    repo: "https://github.com/patsissons/wavelength",
  },
];
