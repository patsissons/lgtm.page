import { json } from "../api";
import { handleAuthorize } from "./authorize";
import { handleCallback } from "./callback";
import { preflight } from "./cors";
import { handleDiscovery, handleJwks } from "./discovery";
import type { AuthEnv } from "./env";
import { missingAuthConfig } from "./env";
import { homePage } from "./html";
import { NO_STORE, html, jsonNoStore } from "./http";
import { handleLogout } from "./logout";
import { handleToken } from "./token";
import type { Mount } from "./types";
import { isProvider } from "./types";
import { handleUserinfo } from "./userinfo";

const PREFIX = "/auth";

/** localhost, loopback and workers.dev: where the broker is path-mounted. */
export function isDevHost(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]" ||
    hostname.endsWith(".workers.dev")
  );
}

/**
 * The broker answers at the root of `AUTH_HOST` (production) and under
 * `/auth/` on localhost and workers.dev (dev and PR previews, which have no
 * custom domain). Never under `/auth/` on lgtm.page itself, so there is
 * exactly one production issuer.
 */
export function authMount(
  url: URL,
  env: Pick<AuthEnv, "AUTH_HOST">,
): Mount | null {
  if (env.AUTH_HOST && url.hostname === env.AUTH_HOST) {
    return { issuer: url.origin, prefix: "" };
  }
  if (
    (url.pathname === PREFIX || url.pathname.startsWith(`${PREFIX}/`)) &&
    isDevHost(url.hostname)
  ) {
    return { issuer: `${url.origin}${PREFIX}`, prefix: PREFIX };
  }
  return null;
}

export async function handleAuth(
  request: Request,
  env: AuthEnv,
  url: URL,
  mount: Mount,
): Promise<Response> {
  const missing = missingAuthConfig(env);
  if (missing.length) {
    return json(
      {
        error: "auth_not_configured",
        error_description: `missing ${missing.join(", ")}`,
      },
      { status: 503, headers: NO_STORE },
    );
  }
  try {
    return await route(request, env, url, mount);
  } catch (error) {
    console.error("lgtm auth:", error);
    return jsonNoStore({ error: "server_error" }, { status: 500 });
  }
}

async function route(
  request: Request,
  env: AuthEnv,
  url: URL,
  mount: Mount,
): Promise<Response> {
  const path = url.pathname.slice(mount.prefix.length) || "/";
  const { method } = request;

  if (path === "/.well-known/openid-configuration") {
    if (method === "OPTIONS") return preflight(request, "public");
    if (method === "GET") return handleDiscovery(request, mount);
  } else if (path === "/.well-known/jwks.json") {
    if (method === "OPTIONS") return preflight(request, "public");
    if (method === "GET") return handleJwks(request, env);
  } else if (path === "/authorize") {
    if (method === "GET") return handleAuthorize(request, env, url, mount);
  } else if (path.startsWith("/callback/")) {
    const provider = path.slice("/callback/".length);
    if (method === "GET" && isProvider(provider)) {
      return handleCallback(request, env, url, mount, provider);
    }
  } else if (path === "/token") {
    if (method === "OPTIONS") return preflight(request, "clients");
    if (method === "POST") return handleToken(request, env, mount);
  } else if (path === "/userinfo") {
    if (method === "OPTIONS") return preflight(request, "clients");
    if (method === "GET") return handleUserinfo(request, env, mount);
  } else if (path === "/logout") {
    if (method === "GET") return handleLogout(url);
  } else if (path === "/") {
    if (method === "GET") return html(homePage(mount));
  } else {
    return jsonNoStore({ error: "not_found" }, { status: 404 });
  }
  return jsonNoStore({ error: "method_not_allowed" }, { status: 405 });
}
