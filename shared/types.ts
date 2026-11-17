/**
 * One app in the registry (shared/apps.ts): a hosted app with a home page,
 * a small static site the Worker proxies from `site`, or a repo-only
 * project (a CLI, a library) whose card is its GitHub page.
 */
export type AppEntry = HostedApp | SiteApp | RepoOnlyApp;

interface AppEntryBase {
  /** Stable id; also the React key, and the auth `client_id` of a hosted app. */
  slug: string;
  /** Overrides for an app whose own tags are missing or poor. */
  title?: string;
  description?: string;
  /**
   * The card image, used even when the page's tags could not be fetched.
   * Absolute, or relative to the home page (a site's subdomain URL for a
   * site entry); for a repo-only entry, a path
   * in the repo (on its default branch), e.g. an image from its README.
   */
  image?: string;
}

export interface HostedApp extends AppEntryBase {
  /** The app's home page; its HTML is fetched for the Open Graph tags. */
  url: string;
  /** Source repository, linked from the card. */
  repo?: string;
  site?: undefined;
}

/**
 * A static site served by the index's Worker at https://<slug>.lgtm.page/
 * and https://lgtm.page/<slug>/, each file fetched from `site` (worker/site.ts).
 * Like a repo-only entry, it is never an auth client or a CORS origin.
 */
export interface SiteApp extends AppEntryBase {
  url?: undefined;
  /**
   * Base URL the site's files are fetched from, e.g.
   * https://raw.githubusercontent.com/owner/repo/refs/heads/main/site
   */
  site: string;
  /** Source repository, linked from the card. */
  repo?: string;
}

/**
 * A project with no website. The card links to `repo` and reads GitHub's
 * tags for it; it is never an auth client and never a CORS origin.
 */
export interface RepoOnlyApp extends AppEntryBase {
  url?: undefined;
  site?: undefined;
  repo: string;
}

/** Link-preview metadata read from an app's HTML. */
export interface AppMeta {
  title?: string;
  description?: string;
  image?: string;
  imageAlt?: string;
  themeColor?: string;
  icon?: string;
}

/** What /api/apps returns for each app, in registry order. */
export interface AppCard extends AppMeta {
  slug: string;
  url: string;
  host: string;
  title: string;
  repo?: string;
  /** "error" when the app's HTML could not be fetched or read. */
  status: "ok" | "error";
}
