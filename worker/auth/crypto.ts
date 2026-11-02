import { fromBase64Url, toBase64Url } from "@shared/auth";

/**
 * Everything the broker hands out (the pending request, the authorization
 * code, the broker session) is sealed with AES-GCM under a key derived from
 * the master secret for that one purpose, so a code can never be opened as
 * a session cookie.
 */
export type SealPurpose = "txn" | "session" | "code";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const keys = new Map<string, Promise<CryptoKey>>();

function sealKey(master: string, purpose: SealPurpose): Promise<CryptoKey> {
  const id = `${purpose}\0${master}`;
  let key = keys.get(id);
  if (!key) {
    key = crypto.subtle
      .importKey("raw", encoder.encode(master), "HKDF", false, ["deriveKey"])
      .then((raw) =>
        crypto.subtle.deriveKey(
          {
            name: "HKDF",
            hash: "SHA-256",
            salt: new Uint8Array(0),
            info: encoder.encode(`lgtm-auth:${purpose}`),
          },
          raw,
          { name: "AES-GCM", length: 256 },
          false,
          ["encrypt", "decrypt"],
        ),
      );
    keys.set(id, key);
  }
  return key;
}

/** base64url(iv || ciphertext) of the JSON payload. */
export async function seal(
  master: string,
  purpose: SealPurpose,
  payload: unknown,
): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await sealKey(master, purpose),
    encoder.encode(JSON.stringify(payload)),
  );
  const sealed = new Uint8Array(iv.length + ciphertext.byteLength);
  sealed.set(iv);
  sealed.set(new Uint8Array(ciphertext), iv.length);
  return toBase64Url(sealed);
}

/** Null for a missing, malformed, tampered or wrong-purpose value. */
export async function open(
  master: string,
  purpose: SealPurpose,
  sealed: string | null | undefined,
): Promise<unknown> {
  if (!sealed) return null;
  const bytes = fromBase64Url(sealed);
  if (!bytes || bytes.length <= 12) return null;
  try {
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: bytes.slice(0, 12) },
      await sealKey(master, purpose),
      bytes.slice(12),
    );
    return JSON.parse(decoder.decode(plain)) as unknown;
  } catch {
    return null;
  }
}

export function randomToken(bytes = 32): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(bytes)));
}

/** base64url(SHA-256(text)), the PKCE S256 transform. */
export async function sha256Base64Url(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(text));
  return toBase64Url(new Uint8Array(digest));
}

/** Compares two strings in time independent of where they differ. */
export function timingSafeEqual(a: string, b: string): boolean {
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  let diff = left.length ^ right.length;
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  }
  return diff === 0;
}

/** Seconds since the epoch, the unit every token and TTL uses. */
export function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}
