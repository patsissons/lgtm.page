import { corsHeaders } from "./cors";
import { nowSeconds } from "./crypto";
import type { AuthEnv } from "./env";
import { jsonNoStore } from "./http";
import { loadSigningKeys, verifyJwt } from "./jwt";
import type { Mount } from "./types";

const PROFILE = [
  "sub",
  "email",
  "email_verified",
  "name",
  "picture",
  "preferred_username",
  "provider",
  "provider_id",
] as const;

/** GET /userinfo with one of our access tokens; the claims come from the token. */
export async function handleUserinfo(
  request: Request,
  env: AuthEnv,
  mount: Mount,
): Promise<Response> {
  const cors = corsHeaders(request, "clients");
  const header = request.headers.get("authorization") ?? "";
  const token = /^bearer /i.test(header) ? header.slice(7).trim() : "";
  const keys = await loadSigningKeys(env.AUTH_SIGNING_KEYS);
  const verified = token
    ? await verifyJwt(token, keys, { issuer: mount.issuer, now: nowSeconds() })
    : null;
  if (!verified || verified.header.typ !== "at+jwt") {
    return jsonNoStore(
      { error: "invalid_token" },
      {
        status: 401,
        headers: {
          ...cors,
          "www-authenticate": 'Bearer error="invalid_token"',
        },
      },
    );
  }
  const body: Record<string, unknown> = {};
  for (const claim of PROFILE) {
    if (verified.claims[claim] !== undefined)
      body[claim] = verified.claims[claim];
  }
  return jsonNoStore(body, { headers: cors });
}
