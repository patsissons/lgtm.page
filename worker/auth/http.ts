import { json } from "../api";

/** Everything the broker serves is per-user and must never be cached. */
export const NO_STORE: Record<string, string> = {
  "cache-control": "no-store",
  pragma: "no-cache",
};

/** The broker's pages carry sign-in state and are never framed or referred. */
export const HTML_SECURITY: Record<string, string> = {
  "x-frame-options": "DENY",
  "content-security-policy": "frame-ancestors 'none'",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
};

export function html(body: string, init: ResponseInit = {}): Response {
  return new Response(body, {
    ...init,
    headers: {
      "content-type": "text/html; charset=utf-8",
      ...NO_STORE,
      ...HTML_SECURITY,
      ...init.headers,
    },
  });
}

export function redirect(
  location: string,
  headers: HeadersInit = {},
): Response {
  const merged = new Headers(headers);
  merged.set("location", location);
  for (const [name, value] of Object.entries(NO_STORE)) merged.set(name, value);
  return new Response(null, { status: 302, headers: merged });
}

/** An RFC 6749 §5.2 error body. */
export function oauthError(
  status: number,
  error: string,
  description: string,
  headers: HeadersInit = {},
): Response {
  return json(
    { error, error_description: description },
    {
      status,
      headers: { ...NO_STORE, ...Object.fromEntries(new Headers(headers)) },
    },
  );
}

export function jsonNoStore(body: unknown, init: ResponseInit = {}): Response {
  return json(body, {
    ...init,
    headers: { ...NO_STORE, ...Object.fromEntries(new Headers(init.headers)) },
  });
}

/** The form body of a token request, or null when it is not form-encoded. */
export async function formBody(
  request: Request,
): Promise<URLSearchParams | null> {
  const type = request.headers.get("content-type") ?? "";
  if (
    !type
      .split(";")[0]
      .trim()
      .toLowerCase()
      .startsWith("application/x-www-form-urlencoded")
  ) {
    return null;
  }
  return new URLSearchParams(await request.text());
}
