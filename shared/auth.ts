/**
 * Pure helpers shared by the Worker's identity broker (worker/auth) and the
 * scripts that provision it (scripts/auth). WebCrypto only: no DOM, no
 * Workers globals, so this runs in the browser, workerd and Node alike.
 */

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Null for anything that is not base64url. */
export function fromBase64Url(text: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) return null;
  try {
    const padded = text.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
}

export function utf8ToBase64Url(text: string): string {
  return toBase64Url(encoder.encode(text));
}

export function base64UrlToUtf8(text: string): string | null {
  const bytes = fromBase64Url(text);
  return bytes ? decoder.decode(bytes) : null;
}

/** A P-256 key's RFC 7638 thumbprint, which the broker uses as its `kid`. */
export async function jwkThumbprint(jwk: {
  crv?: string;
  kty?: string;
  x?: string;
  y?: string;
}): Promise<string> {
  const canonical = JSON.stringify({
    crv: jwk.crv,
    kty: jwk.kty,
    x: jwk.x,
    y: jwk.y,
  });
  const digest = await crypto.subtle.digest(
    "SHA-256",
    encoder.encode(canonical),
  );
  return toBase64Url(new Uint8Array(digest));
}

/**
 * A confidential client's secret is derived from the broker's master secret
 * and the client id (its registry slug), so there is no secret store to
 * keep. Rotating the master secret rotates every client secret.
 */
export async function deriveClientSecret(
  masterSecret: string,
  clientId: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(masterSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`lgtm-auth:client-secret:${clientId}`),
  );
  return toBase64Url(new Uint8Array(mac));
}
