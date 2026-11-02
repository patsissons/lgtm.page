import { verifyClientSecret } from "./clients";
import { burnCode, openCode } from "./code";
import { corsHeaders } from "./cors";
import { nowSeconds, randomToken, sha256Base64Url } from "./crypto";
import type { AuthEnv } from "./env";
import { formBody, jsonNoStore, oauthError } from "./http";
import { loadSigningKeys, signJwt } from "./jwt";
import type { CodePayload, Identity, Mount } from "./types";

/** Access and id tokens live this long; there are no refresh tokens. */
export const TOKEN_TTL = 3600;
const VERIFIER = /^[A-Za-z0-9._~-]{43,128}$/;

/** The claims every token (and /userinfo) carries about the user. */
export function profileClaims(identity: Identity): Record<string, unknown> {
  const claims: Record<string, unknown> = {
    sub: identity.sub,
    email_verified: identity.email_verified,
    provider: identity.provider,
    provider_id: identity.provider_id,
  };
  if (identity.email !== undefined) claims.email = identity.email;
  if (identity.name !== undefined) claims.name = identity.name;
  if (identity.picture !== undefined) claims.picture = identity.picture;
  if (identity.preferred_username !== undefined) {
    claims.preferred_username = identity.preferred_username;
  }
  return claims;
}

export async function issueTokens(
  env: Pick<AuthEnv, "AUTH_SIGNING_KEYS">,
  mount: Mount,
  code: CodePayload,
  now = nowSeconds(),
): Promise<{ access_token: string; id_token: string }> {
  const [key] = await loadSigningKeys(env.AUTH_SIGNING_KEYS);
  const base = {
    iss: mount.issuer,
    aud: code.client_id,
    iat: now,
    exp: now + TOKEN_TTL,
    auth_time: code.auth_time,
    ...profileClaims(code.identity),
    sub: code.identity.sub,
  };
  const [id_token, access_token] = await Promise.all([
    signJwt(key, "JWT", {
      ...base,
      ...(code.nonce !== undefined ? { nonce: code.nonce } : {}),
    }),
    signJwt(key, "at+jwt", {
      ...base,
      client_id: code.client_id,
      scope: code.scope,
      jti: randomToken(16),
    }),
  ]);
  return { access_token, id_token };
}

function basicAuth(request: Request): { id: string; secret: string } | null {
  const header = request.headers.get("authorization");
  if (!header || !/^basic /i.test(header)) return null;
  try {
    const decoded = atob(header.slice(6).trim());
    const index = decoded.indexOf(":");
    if (index < 0) return null;
    return {
      id: decodeURIComponent(decoded.slice(0, index)),
      secret: decodeURIComponent(decoded.slice(index + 1)),
    };
  } catch {
    return null;
  }
}

/**
 * POST /token. A code minted with a PKCE challenge needs the verifier; one
 * minted without needs the client's derived secret; a presented secret is
 * always checked. The code is burned only once the request has passed.
 */
export async function handleToken(
  request: Request,
  env: AuthEnv,
  mount: Mount,
): Promise<Response> {
  const cors = corsHeaders(request, "clients");
  const now = nowSeconds();
  const form = await formBody(request);
  if (!form) {
    return oauthError(
      400,
      "invalid_request",
      "body must be application/x-www-form-urlencoded",
      cors,
    );
  }
  if (form.get("grant_type") !== "authorization_code") {
    return oauthError(
      400,
      "unsupported_grant_type",
      "only authorization_code is supported",
      cors,
    );
  }

  const basic = basicAuth(request);
  const formClientId = form.get("client_id");
  const formSecret = form.get("client_secret");
  if (basic && formClientId !== null && formClientId !== basic.id) {
    return oauthError(400, "invalid_request", "client_id mismatch", cors);
  }
  if (basic && formSecret !== null) {
    return oauthError(
      400,
      "invalid_request",
      "use one client authentication method",
      cors,
    );
  }
  const clientId = basic?.id ?? formClientId;
  const clientSecret = basic?.secret ?? formSecret ?? undefined;
  const unauthorized = (description: string) =>
    oauthError(401, "invalid_client", description, {
      ...cors,
      ...(basic
        ? { "www-authenticate": 'Basic realm="lgtm.page sign-in"' }
        : {}),
    });
  if (!clientId) return unauthorized("client_id is required");

  const code = await openCode(env, form.get("code"), now);
  if (!code || code.client_id !== clientId) {
    return oauthError(400, "invalid_grant", "code is invalid or expired", cors);
  }
  if (code.redirect_uri !== form.get("redirect_uri")) {
    return oauthError(400, "invalid_grant", "redirect_uri mismatch", cors);
  }
  if (clientSecret !== undefined) {
    const ok = await verifyClientSecret(
      env.AUTH_MASTER_SECRET,
      clientId,
      clientSecret,
    );
    if (!ok) return unauthorized("client secret is wrong");
  }
  if (code.code_challenge !== undefined) {
    const verifier = form.get("code_verifier");
    if (
      !verifier ||
      !VERIFIER.test(verifier) ||
      (await sha256Base64Url(verifier)) !== code.code_challenge
    ) {
      return oauthError(400, "invalid_grant", "code_verifier mismatch", cors);
    }
  } else if (clientSecret === undefined) {
    return unauthorized("this code needs a client secret or PKCE");
  }

  if (!(await burnCode(env.AUTH_KV, code.jti))) {
    return oauthError(400, "invalid_grant", "code already redeemed", cors);
  }

  const tokens = await issueTokens(env, mount, code, now);
  return jsonNoStore(
    {
      access_token: tokens.access_token,
      token_type: "Bearer",
      expires_in: TOKEN_TTL,
      id_token: tokens.id_token,
      scope: code.scope,
    },
    { headers: cors },
  );
}
