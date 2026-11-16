/**
 * One app in the registry (shared/apps.ts): a hosted app with a home page,
 * or a repo-only project (a CLI, a library) whose card is its GitHub page.
 */
export type AppEntry = HostedApp | RepoOnlyApp;

interface AppEntryBase {
  /** Stable id; also the React key, and the auth `client_id` of a hosted app. */
  slug: string;
  /** Overrides for an app whose own tags are missing or poor. */
  title?: string;
  description?: string;
  /**
   * The card image, used even when the page's tags could not be fetched.
   * Absolute, or relative to the home page; for a repo-only entry, a path
   * in the repo (on its default branch), e.g. an image from its README.
   */
  image?: string;
}

export interface HostedApp extends AppEntryBase {
  /** The app's home page; its HTML is fetched for the Open Graph tags. */
  url: string;
  /** Source repository, linked from the card. */
  repo?: string;
}

/**
 * A project with no website. The card links to `repo` and reads GitHub's
 * tags for it; it is never an auth client and never a CORS origin.
 */
export interface RepoOnlyApp extends AppEntryBase {
  url?: undefined;
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
