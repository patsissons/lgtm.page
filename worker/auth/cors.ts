import { isAllowedOrigin } from "./clients";

const METHODS = "GET, POST, OPTIONS";
const HEADERS = "authorization, content-type";

/**
 * Discovery and JWKS are public; the token and userinfo endpoints answer
 * browsers on a registry origin or loopback. Credentials are never allowed.
 */
export function corsHeaders(
  request: Request,
  scope: "public" | "clients",
): Record<string, string> {
  const origin = request.headers.get("origin");
  if (scope === "public") {
    return { "access-control-allow-origin": "*" };
  }
  if (!isAllowedOrigin(origin)) return {};
  return {
    "access-control-allow-origin": origin!,
    vary: "origin",
  };
}

export function preflight(
  request: Request,
  scope: "public" | "clients",
): Response {
  const allow = corsHeaders(request, scope);
  if (!allow["access-control-allow-origin"]) {
    return new Response(null, { status: 403 });
  }
  return new Response(null, {
    status: 204,
    headers: {
      ...allow,
      "access-control-allow-methods": METHODS,
      "access-control-allow-headers": HEADERS,
      "access-control-max-age": "86400",
    },
  });
}
