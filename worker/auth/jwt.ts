import {
  base64UrlToUtf8,
  fromBase64Url,
  toBase64Url,
  utf8ToBase64Url,
} from "@shared/auth";

/** A P-256 JWK as the broker uses it: the Workers `JsonWebKey` has no `kid`. */
export interface Jwk {
  kty: string;
  crv: string;
  x: string;
  y: string;
  /** Present on private keys only. */
  d?: string;
  kid: string;
  use?: string;
  alg?: string;
}

/** One entry of the `AUTH_SIGNING_KEYS` secret, imported. */
export interface SigningKey {
  kid: string;
  privateKey: CryptoKey;
  publicKey: CryptoKey;
  /** The public half, as served from the JWKS endpoint. */
  jwk: Jwk;
}

export type JwtType = "JWT" | "at+jwt";

export interface JwtHeader {
  alg: "ES256";
  typ: JwtType;
  kid: string;
}

export interface JwtClaims {
  iss: string;
  sub: string;
  aud: string;
  exp: number;
  iat: number;
  [claim: string]: unknown;
}

const CURVE = { name: "ECDSA", namedCurve: "P-256" } as const;
const SIGNATURE = { name: "ECDSA", hash: "SHA-256" } as const;
const encoder = new TextEncoder();

let cache: { raw: string; keys: Promise<SigningKey[]> } | null = null;

/**
 * Parses the JSON array of private P-256 JWKs (each with a `kid`). The first
 * key signs; all of them are published, which is what makes rotation (prepend
 * a key, deploy, drop the old one later) seamless. Memoised per isolate.
 */
export function loadSigningKeys(raw: string): Promise<SigningKey[]> {
  if (cache?.raw === raw) return cache.keys;
  const keys = importKeys(raw);
  cache = { raw, keys };
  keys.catch(() => {
    if (cache?.raw === raw) cache = null;
  });
  return keys;
}

async function importKeys(raw: string): Promise<SigningKey[]> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("AUTH_SIGNING_KEYS is not JSON");
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("AUTH_SIGNING_KEYS must be a non-empty JSON array");
  }
  return Promise.all(parsed.map((entry, i) => importKey(entry, i)));
}

async function importKey(entry: unknown, index: number): Promise<SigningKey> {
  const jwk = entry as Partial<Jwk> | null;
  if (
    typeof jwk !== "object" ||
    jwk === null ||
    jwk.kty !== "EC" ||
    jwk.crv !== "P-256" ||
    typeof jwk.x !== "string" ||
    typeof jwk.y !== "string" ||
    typeof jwk.d !== "string" ||
    typeof jwk.kid !== "string" ||
    jwk.kid === ""
  ) {
    throw new Error(
      `AUTH_SIGNING_KEYS[${index}] must be a private P-256 JWK with a kid`,
    );
  }
  const publicJwk: Jwk = {
    kty: "EC",
    crv: "P-256",
    x: jwk.x,
    y: jwk.y,
    kid: jwk.kid,
    use: "sig",
    alg: "ES256",
  };
  const [privateKey, publicKey] = await Promise.all([
    crypto.subtle.importKey(
      "jwk",
      { kty: "EC", crv: "P-256", x: jwk.x, y: jwk.y, d: jwk.d },
      CURVE,
      false,
      ["sign"],
    ),
    crypto.subtle.importKey(
      "jwk",
      { kty: "EC", crv: "P-256", x: jwk.x, y: jwk.y },
      CURVE,
      true,
      ["verify"],
    ),
  ]);
  return { kid: jwk.kid, privateKey, publicKey, jwk: publicJwk };
}

export function publicJwks(keys: SigningKey[]): { keys: Jwk[] } {
  return { keys: keys.map((key) => key.jwk) };
}

/** ES256 compact JWS. WebCrypto's raw r||s signature is already JWS format. */
export async function signJwt(
  key: SigningKey,
  typ: JwtType,
  claims: JwtClaims,
): Promise<string> {
  const header: JwtHeader = { alg: "ES256", typ, kid: key.kid };
  const signingInput = `${utf8ToBase64Url(JSON.stringify(header))}.${utf8ToBase64Url(JSON.stringify(claims))}`;
  const signature = await crypto.subtle.sign(
    SIGNATURE,
    key.privateKey,
    encoder.encode(signingInput),
  );
  return `${signingInput}.${toBase64Url(new Uint8Array(signature))}`;
}

export interface VerifiedJwt {
  header: JwtHeader;
  claims: JwtClaims;
}

/**
 * Null unless the token was signed by one of `keys`, is unexpired and names
 * `issuer`. Audience and type are the caller's to check.
 */
export async function verifyJwt(
  token: string,
  keys: SigningKey[],
  expect: { issuer: string; now: number },
): Promise<VerifiedJwt | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [encodedHeader, encodedClaims, encodedSignature] = parts;
  const header = decodeJson(encodedHeader) as Partial<JwtHeader> | null;
  const claims = decodeJson(encodedClaims) as Partial<JwtClaims> | null;
  const signature = fromBase64Url(encodedSignature);
  if (!header || !claims || !signature) return null;
  if (header.alg !== "ES256" || typeof header.kid !== "string") return null;
  if (header.typ !== "JWT" && header.typ !== "at+jwt") return null;
  const key = keys.find((k) => k.kid === header.kid);
  if (!key) return null;
  const valid = await crypto.subtle.verify(
    SIGNATURE,
    key.publicKey,
    signature,
    encoder.encode(`${encodedHeader}.${encodedClaims}`),
  );
  if (!valid) return null;
  if (
    claims.iss !== expect.issuer ||
    typeof claims.sub !== "string" ||
    typeof claims.aud !== "string" ||
    typeof claims.exp !== "number" ||
    typeof claims.iat !== "number" ||
    !(claims.exp > expect.now)
  ) {
    return null;
  }
  return {
    header: { alg: "ES256", typ: header.typ, kid: header.kid },
    claims: claims as JwtClaims,
  };
}

/** The payload of a JWT, unverified: only for tokens received over TLS from their issuer. */
export function decodeJwtPayload(
  token: string,
): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const payload = decodeJson(parts[1]);
  return payload && typeof payload === "object" && !Array.isArray(payload)
    ? (payload as Record<string, unknown>)
    : null;
}

function decodeJson(encoded: string): unknown {
  const text = base64UrlToUtf8(encoded);
  if (text === null) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}
