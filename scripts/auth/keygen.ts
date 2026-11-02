/**
 * Prints a fresh signing key for the identity broker as the JSON array the
 * `AUTH_SIGNING_KEYS` secret expects (a private P-256 JWK whose `kid` is its
 * RFC 7638 thumbprint).
 *
 *   pnpm auth:keygen                 # a brand-new key set
 *   pnpm auth:keygen --rotate '[…]'  # the new key prepended to an existing set
 *
 * Store it with `wrangler secret put AUTH_SIGNING_KEYS` (paste the array) and
 * in `.dev.vars` locally. The first key signs; every key is published, so an
 * old key keeps verifying until it is removed, which is safe once every
 * token it signed has expired (an hour) and JWKS caches have turned over.
 */
import { jwkThumbprint } from "../../shared/auth.ts";

const pair = (await crypto.subtle.generateKey(
  { name: "ECDSA", namedCurve: "P-256" },
  true,
  ["sign", "verify"],
)) as CryptoKeyPair;
const exported = (await crypto.subtle.exportKey(
  "jwk",
  pair.privateKey,
)) as JsonWebKey;
const { kty, crv, x, y, d } = exported;
const key = { kty, crv, x, y, d, kid: await jwkThumbprint(exported) };

const rotateIndex = process.argv.indexOf("--rotate");
const existing: unknown[] =
  rotateIndex >= 0
    ? (JSON.parse(process.argv[rotateIndex + 1] ?? "[]") as unknown[])
    : [];
if (!Array.isArray(existing)) {
  console.error("--rotate expects the current AUTH_SIGNING_KEYS JSON array");
  process.exit(1);
}

process.stdout.write(JSON.stringify([key, ...existing]) + "\n");
