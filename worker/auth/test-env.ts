import { jwkThumbprint } from "@shared/auth";
import { randomToken, sha256Base64Url } from "./crypto";
import type { AuthEnv } from "./env";
import type { Jwk, SigningKey } from "./jwt";
import { loadSigningKeys } from "./jwt";
import type { Identity, Mount } from "./types";

/** A private P-256 JWK with its thumbprint as `kid`, as `pnpm auth:keygen` prints. */
export async function generateSigningJwk(): Promise<Jwk> {
  const pair = (await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;
  const jwk = (await crypto.subtle.exportKey("jwk", pair.privateKey)) as Jwk;
  const { kty, crv, x, y, d } = jwk;
  return { kty, crv, x, y, d, kid: await jwkThumbprint(jwk) };
}

export async function testSigningKeys(count = 1): Promise<{
  raw: string;
  keys: SigningKey[];
}> {
  const jwks: Jwk[] = [];
  for (let i = 0; i < count; i++) jwks.push(await generateSigningJwk());
  const raw = JSON.stringify(jwks);
  return { raw, keys: await loadSigningKeys(raw) };
}

/** An in-memory `AUTH_KV` that remembers the TTL of every write. */
export class FakeKV {
  readonly store = new Map<string, string>();
  readonly writes: { key: string; expirationTtl?: number }[] = [];

  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }

  async put(
    key: string,
    value: string,
    options?: { expirationTtl?: number },
  ): Promise<void> {
    this.store.set(key, value);
    this.writes.push({ key, expirationTtl: options?.expirationTtl });
  }
}

export const MASTER_SECRET = "test-master-secret";

export interface TestEnv extends AuthEnv {
  AUTH_KV: KVNamespace & FakeKV;
}

/** A fully configured broker env with a fresh signing key. */
export async function makeEnv(
  overrides: Partial<AuthEnv> = {},
): Promise<TestEnv> {
  const { raw } = await testSigningKeys();
  return {
    ASSETS: {} as Fetcher,
    AUTH_KV: new FakeKV() as unknown as KVNamespace & FakeKV,
    AUTH_HOST: "auth.lgtm.page",
    AUTH_PROVIDER_ORIGIN: "",
    GITHUB_CLIENT_ID: "gh-client",
    GITHUB_CLIENT_SECRET: "gh-secret",
    GOOGLE_CLIENT_ID: "google-client",
    GOOGLE_CLIENT_SECRET: "google-secret",
    AUTH_SIGNING_KEYS: raw,
    AUTH_MASTER_SECRET: MASTER_SECRET,
    ...overrides,
  } as TestEnv;
}

export const PROD_MOUNT: Mount = {
  issuer: "https://auth.lgtm.page",
  prefix: "",
};
export const DEV_MOUNT: Mount = {
  issuer: "http://localhost:5173/auth",
  prefix: "/auth",
};

export const IDENTITY: Identity = {
  sub: "github:42",
  provider: "github",
  provider_id: "42",
  email: "pat@example.com",
  email_verified: true,
  name: "Pat",
  picture: "https://avatars.example/42",
  preferred_username: "pat",
};

/** A PKCE verifier and its S256 challenge. */
export async function pkce(): Promise<{ verifier: string; challenge: string }> {
  const verifier = randomToken(32);
  return { verifier, challenge: await sha256Base64Url(verifier) };
}

/** The cookie values a response set, by name. */
export function setCookies(res: Response): Record<string, string> {
  const cookies: Record<string, string> = {};
  for (const header of res.headers.getSetCookie()) {
    const [pair] = header.split(";");
    const index = pair.indexOf("=");
    cookies[pair.slice(0, index)] = pair.slice(index + 1);
  }
  return cookies;
}

export function cookieHeaderFrom(cookies: Record<string, string>): string {
  return Object.entries(cookies)
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}
