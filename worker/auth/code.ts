import { cookieHeader } from "./cookies";
import { nowSeconds, open, randomToken, seal } from "./crypto";
import type { AuthEnv } from "./env";
import { redirect } from "./http";
import { isIdentity } from "./session";
import type { CodePayload, Identity, Mount } from "./types";

/** An app has this long to redeem a code. */
export const CODE_TTL = 60;
/** The burn record outlives the code; KV's minimum expiration is 60 s. */
export const CODE_BURN_TTL = 120;

/** The one thing the broker stores: which codes were already redeemed. */
export type CodeStore = Pick<KVNamespace, "get" | "put">;

type Secrets = Pick<AuthEnv, "AUTH_MASTER_SECRET">;

/** The code is its own sealed payload; nothing is stored when it is minted. */
export function mintCode(
  env: Secrets,
  payload: Omit<CodePayload, "jti" | "exp">,
  now = nowSeconds(),
): Promise<string> {
  const full: CodePayload = {
    ...payload,
    jti: randomToken(16),
    exp: now + CODE_TTL,
  };
  return seal(env.AUTH_MASTER_SECRET, "code", full);
}

/** Null for a foreign, tampered or expired code. Does not burn it. */
export async function openCode(
  env: Secrets,
  code: string | null | undefined,
  now = nowSeconds(),
): Promise<CodePayload | null> {
  const value = (await open(
    env.AUTH_MASTER_SECRET,
    "code",
    code,
  )) as Partial<CodePayload> | null;
  if (
    !value ||
    typeof value.jti !== "string" ||
    typeof value.client_id !== "string" ||
    typeof value.redirect_uri !== "string" ||
    typeof value.scope !== "string" ||
    !isIdentity(value.identity) ||
    typeof value.auth_time !== "number" ||
    typeof value.exp !== "number" ||
    value.exp <= now
  ) {
    return null;
  }
  return value as CodePayload;
}

/** False when the code was already redeemed. One KV write per login. */
export async function burnCode(
  store: CodeStore,
  jti: string,
): Promise<boolean> {
  const key = `code:${jti}`;
  if ((await store.get(key)) !== null) return false;
  await store.put(key, "1", { expirationTtl: CODE_BURN_TTL });
  return true;
}

export interface Grant {
  client_id: string;
  redirect_uri: string;
  state?: string;
  nonce?: string;
  scope: string;
  code_challenge?: string;
}

/** Appends OAuth response parameters to a redirect URI's query. */
export function withParams(
  uri: string,
  params: Record<string, string | undefined>,
): string {
  const url = new URL(uri);
  for (const [name, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(name, value);
  }
  return url.href;
}

/** Sends the user back to the app with a fresh code (plus `state` and `iss`). */
export async function authorizationResponse(
  env: Secrets,
  mount: Mount,
  grant: Grant,
  identity: Identity,
  authTime: number,
  headers: HeadersInit = {},
  now = nowSeconds(),
): Promise<Response> {
  const code = await mintCode(
    env,
    {
      client_id: grant.client_id,
      redirect_uri: grant.redirect_uri,
      code_challenge: grant.code_challenge,
      nonce: grant.nonce,
      scope: grant.scope,
      identity,
      auth_time: authTime,
    },
    now,
  );
  return redirect(
    withParams(grant.redirect_uri, {
      code,
      state: grant.state,
      iss: mount.issuer,
    }),
    headers,
  );
}

export { cookieHeader };
