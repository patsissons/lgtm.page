/** One app in the registry (shared/apps.ts). */
export interface AppEntry {
  /** Stable id; also the React key. */
  slug: string;
  /** The app's home page; its HTML is fetched for the Open Graph tags. */
  url: string;
  /** Source repository, linked from the card. */
  repo?: string;
  /** Overrides for an app whose own tags are missing or poor. */
  title?: string;
  description?: string;
  /** Absolute, or relative to `url`. */
  image?: string;
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
