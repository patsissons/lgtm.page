import { apps } from "@shared/apps";
import { deriveClientSecret } from "@shared/auth";
import type { AppEntry } from "@shared/types";
import { timingSafeEqual } from "./crypto";

/**
 * The registry is the client list: `client_id` is an app's slug and its
 * redirects may land anywhere on the app's own origin. There is no second
 * allowlist to keep in sync.
 */
export interface Client {
  id: string;
  origin: string;
}

/**
 * The index itself (worker/account.ts) signs in through the broker too. It
 * is not a registry app, so it is the one built-in client.
 */
export const INDEX_CLIENT: Client = { id: "lgtm", origin: "https://lgtm.page" };

export function findClient(
  id: string | null | undefined,
  registry: readonly AppEntry[] = apps,
): Client | null {
  if (!id) return null;
  if (id === INDEX_CLIENT.id) return INDEX_CLIENT;
  const entry = registry.find((app) => app.slug === id);
  return entry ? { id: entry.slug, origin: new URL(entry.url).origin } : null;
}

/** `http://localhost:*`, `http://127.0.0.1:*` or `http://[::1]:*` (RFC 8252). */
export function isLoopback(url: URL): boolean {
  return (
    url.protocol === "http:" &&
    (url.hostname === "localhost" ||
      url.hostname === "127.0.0.1" ||
      url.hostname === "[::1]")
  );
}

/** The app's own origin over https, or loopback for its local dev. No fragments. */
export function isAllowedRedirect(client: Client, uri: string): boolean {
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return false;
  }
  if (url.hash !== "" || uri.endsWith("#")) return false;
  if (isLoopback(url)) return true;
  return url.protocol === "https:" && url.origin === client.origin;
}

/** Whether a browser `Origin` may call the token and userinfo endpoints. */
export function isAllowedOrigin(
  origin: string | null,
  registry: readonly AppEntry[] = apps,
): boolean {
  if (!origin) return false;
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  if (url.origin !== origin) return false;
  if (isLoopback(url) || origin === INDEX_CLIENT.origin) return true;
  return registry.some((app) => new URL(app.url).origin === origin);
}

export async function verifyClientSecret(
  masterSecret: string,
  clientId: string,
  presented: string,
): Promise<boolean> {
  const expected = await deriveClientSecret(masterSecret, clientId);
  return timingSafeEqual(expected, presented);
}
