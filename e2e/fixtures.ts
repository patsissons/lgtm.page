import type { Page } from "@playwright/test";
import type { AppCard } from "../shared/types";

/** A tiny PNG so card images load without touching the network. */
const PIXEL = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

export const CARDS: AppCard[] = [
  {
    slug: "wavelength",
    url: "https://wavelength.lgtm.page/",
    host: "wavelength.lgtm.page",
    title: "Wavelength",
    description: "Read your friends' minds.",
    image: "https://wavelength.lgtm.page/og.png",
    imageAlt: "The Wavelength board",
    repo: "https://github.com/patsissons/wavelength",
    status: "ok",
  },
  {
    slug: "broken",
    url: "https://broken.lgtm.page/",
    host: "broken.lgtm.page",
    title: "broken.lgtm.page",
    status: "error",
  },
];

/** Serves /api/apps and the apps themselves (pages and images) locally. */
export async function stubApps(page: Page, cards: AppCard[] = CARDS) {
  await page.route("**/api/apps", (route) => route.fulfill({ json: cards }));
  await page.route("https://*.lgtm.page/**", (route) =>
    route.request().resourceType() === "document"
      ? route.fulfill({ contentType: "text/html", body: "<h1>app</h1>" })
      : route.fulfill({ contentType: "image/png", body: PIXEL }),
  );
}
