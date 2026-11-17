import { SITE_DOMAIN, siteFile, sites } from "@shared/apps";
import type { SiteApp } from "@shared/types";
import { FETCH_TIMEOUT_MS, USER_AGENT } from "./api";

/**
 * A request for a proxied site: on its own subdomain (`macbat.lgtm.page`,
 * or `macbat.localhost` in dev), or under the index (`lgtm.page/macbat/`).
 */
export interface SiteMatch {
  entry: SiteApp;
  mode: "subdomain" | "path";
  /** The request path relative to the site's root ("" for `/macbat`). */
  path: string;
}

/**
 * Path mode runs the site on the index's own origin, so it gets an opaque
 * one instead: its scripts can never call the index's API as the visitor.
 */
export const PATH_SANDBOX =
  "sandbox allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox";
/** How long browsers and the edge keep a proxied file. */
export const SITE_CACHE_SECONDS = 300;

const SUBDOMAIN_SUFFIXES = [`.${SITE_DOMAIN}`, ".localhost"];

export function matchSite(
  url: URL,
  table: ReadonlyMap<string, SiteApp> = sites,
): SiteMatch | null {
  for (const suffix of SUBDOMAIN_SUFFIXES) {
    if (!url.hostname.endsWith(suffix)) continue;
    const entry = table.get(url.hostname.slice(0, -suffix.length));
    if (entry) return { entry, mode: "subdomain", path: url.pathname };
  }
  const [, slug = "", ...rest] = url.pathname.split("/");
  const entry = table.get(slug);
  if (!entry) return null;
  const path =
    url.pathname.length > slug.length + 1 ? `/${rest.join("/")}` : "";
  return { entry, mode: "path", path };
}

/**
 * Serves one file of a proxied site, fetched from its `site` base. Nothing
 * from the visitor's request (cookies included) is forwarded, and nothing
 * from the upstream response but its body and ETag is passed back:
 * raw.githubusercontent.com labels everything text/plain and sandboxes it.
 */
export async function handleSite(
  request: Request,
  url: URL,
  match: SiteMatch,
  fetcher: typeof fetch = fetch,
): Promise<Response> {
  const headers = new Headers({ "x-content-type-options": "nosniff" });
  if (match.mode === "path") {
    headers.set("content-security-policy", PATH_SANDBOX);
  }
  const text = (status: number, body: string) => {
    headers.set("content-type", "text/plain; charset=utf-8");
    return new Response(request.method === "HEAD" ? null : body, {
      status,
      headers,
    });
  };

  if (request.method !== "GET" && request.method !== "HEAD") {
    headers.set("allow", "GET, HEAD");
    return text(405, "Method not allowed");
  }
  // Relative links in the site's pages need its root to end in a slash.
  if (match.mode === "path" && match.path === "") {
    const target = new URL(url);
    target.pathname += "/";
    return Response.redirect(target.href, 301);
  }

  const file = siteFile(match.entry.site, match.path);
  if (!file) return text(404, "Not found");

  let res: Response;
  try {
    res = await fetcher(file, {
      headers: { "user-agent": USER_AGENT },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cf: { cacheEverything: true, cacheTtl: SITE_CACHE_SECONDS },
    });
  } catch (error) {
    console.warn(`lgtm: could not load ${file}`, error);
    return text(502, "Bad gateway");
  }
  if (res.status === 404) return text(404, "Not found");
  if (!res.ok) {
    console.warn(`lgtm: could not load ${file}: HTTP ${res.status}`);
    return text(502, "Bad gateway");
  }

  const type = contentType(file) ?? res.headers.get("content-type");
  if (type) headers.set("content-type", type);
  headers.set("cache-control", `public, max-age=${SITE_CACHE_SECONDS}`);
  const etag = res.headers.get("etag");
  if (etag) headers.set("etag", etag);
  return new Response(request.method === "HEAD" ? null : res.body, {
    headers,
  });
}

const TYPES: Record<string, string> = {
  avif: "image/avif",
  css: "text/css; charset=utf-8",
  gif: "image/gif",
  html: "text/html; charset=utf-8",
  ico: "image/x-icon",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  js: "text/javascript; charset=utf-8",
  json: "application/json",
  map: "application/json",
  mjs: "text/javascript; charset=utf-8",
  png: "image/png",
  svg: "image/svg+xml",
  txt: "text/plain; charset=utf-8",
  wasm: "application/wasm",
  webmanifest: "application/manifest+json",
  webp: "image/webp",
  woff: "font/woff",
  woff2: "font/woff2",
  xml: "application/xml",
};

/** The content type of a file by its extension, if it is a known one. */
export function contentType(file: string): string | undefined {
  const name = new URL(file).pathname.split("/").pop() ?? "";
  const dot = name.lastIndexOf(".");
  return dot === -1 ? undefined : TYPES[name.slice(dot + 1).toLowerCase()];
}
