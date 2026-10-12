import { apps } from "@shared/apps";
import type { AppCard, AppEntry, AppMeta } from "@shared/types";
import { parseMeta, resolve } from "./meta";

export function json(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { "content-type": "application/json", ...init.headers },
  });
}

/** How long a fetch of an app's HTML may take before its card errors. */
export const FETCH_TIMEOUT_MS = 5_000;
/** Cards are refetched in the background once they are this old. */
export const FRESH_MS = 60 * 60 * 1000;
/** ...or this old when any app failed, so an outage clears quickly. */
export const FRESH_ERROR_MS = 60 * 1000;
/** Edge-cache lifetime: stale cards are still served while refreshing. */
const STORE_SECONDS = 24 * 60 * 60;
const CLIENT_CACHE = "public, max-age=300";
const FRESH_UNTIL = "x-lgtm-fresh-until";

export async function handleApi(
  request: Request,
  ctx: ExecutionContext,
  url: URL,
): Promise<Response> {
  const path = url.pathname;
  if (path === "/api/health") return json({ ok: true });
  if (path === "/api/apps" && request.method === "GET") {
    return appsResponse(ctx, url);
  }
  return json({ error: "not_found" }, { status: 404 });
}

/**
 * The card list, from the edge cache when possible. A stale entry is served
 * as-is while a fresh one is fetched in the background; `?refresh` skips
 * the cache entirely (and repopulates it).
 */
async function appsResponse(ctx: ExecutionContext, url: URL) {
  const cache = caches.default;
  const key = new Request(new URL("/api/apps", url.origin));

  if (!url.searchParams.has("refresh")) {
    const hit = await cache.match(key);
    if (hit) {
      const freshUntil = Number(hit.headers.get(FRESH_UNTIL));
      if (!(Date.now() < freshUntil)) {
        ctx.waitUntil(refresh(cache, key));
      }
      return forClient(await hit.text());
    }
  }

  return forClient(await refresh(cache, key));
}

/** Fetches every app, stores the result in the cache and returns its body. */
async function refresh(cache: Cache, key: Request): Promise<string> {
  const cards = await loadApps(apps);
  const body = JSON.stringify(cards);
  const fresh = cards.some((c) => c.status === "error")
    ? FRESH_ERROR_MS
    : FRESH_MS;
  await cache.put(
    key,
    new Response(body, {
      headers: {
        "content-type": "application/json",
        "cache-control": `public, max-age=${STORE_SECONDS}`,
        [FRESH_UNTIL]: String(Date.now() + fresh),
      },
    }),
  );
  return body;
}

function forClient(body: string): Response {
  return new Response(body, {
    headers: {
      "content-type": "application/json",
      "cache-control": CLIENT_CACHE,
    },
  });
}

/** Builds every card in registry order; a failing app never fails the list. */
export function loadApps(
  entries: readonly AppEntry[],
  fetcher: typeof fetch = fetch,
): Promise<AppCard[]> {
  return Promise.all(entries.map((entry) => loadApp(entry, fetcher)));
}

async function loadApp(
  entry: AppEntry,
  fetcher: typeof fetch,
): Promise<AppCard> {
  try {
    const res = await fetcher(entry.url, {
      headers: {
        accept: "text/html",
        "user-agent": "lgtm.page-index (+https://lgtm.page)",
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const meta = parseMeta(await res.text(), res.url || entry.url);
    return toCard(entry, meta, "ok");
  } catch (error) {
    console.warn(`lgtm: could not load ${entry.url}`, error);
    return toCard(entry, {}, "error");
  }
}

/** Registry overrides win over the app's own tags. */
export function toCard(
  entry: AppEntry,
  meta: AppMeta,
  status: AppCard["status"],
): AppCard {
  const host = new URL(entry.url).host;
  const card: AppCard = {
    ...meta,
    slug: entry.slug,
    url: entry.url,
    host,
    title: entry.title ?? meta.title ?? host,
    status,
  };
  if (entry.description) card.description = entry.description;
  const image = resolve(entry.image, entry.url);
  if (image) card.image = image;
  if (entry.repo) card.repo = entry.repo;
  return card;
}
