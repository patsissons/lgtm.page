// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  base64UrlToUtf8,
  deriveClientSecret,
  fromBase64Url,
  jwkThumbprint,
  toBase64Url,
  utf8ToBase64Url,
} from "./auth";

describe("base64url", () => {
  it("round-trips bytes without padding or URL-unsafe characters", () => {
    const bytes = Uint8Array.from({ length: 256 }, (_, i) => i);
    const text = toBase64Url(bytes);
    expect(text).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(fromBase64Url(text)).toEqual(bytes);
  });

  it("round-trips text", () => {
    expect(base64UrlToUtf8(utf8ToBase64Url("héllo ✓"))).toBe("héllo ✓");
  });

  it("rejects anything that is not base64url", () => {
    expect(fromBase64Url("a+b/c=")).toBeNull();
    expect(fromBase64Url("not base64")).toBeNull();
    expect(base64UrlToUtf8("###")).toBeNull();
  });
});

describe("jwkThumbprint", () => {
  it("matches the RFC 7638 construction (only crv, kty, x, y, in that order)", async () => {
    const jwk = { kty: "EC", crv: "P-256", x: "x-coord", y: "y-coord" };
    const withPrivate: Parameters<typeof jwkThumbprint>[0] = {
      ...jwk,
      d: "private",
    } as typeof jwk;
    const canonical = `{"crv":"P-256","kty":"EC","x":"x-coord","y":"y-coord"}`;
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(canonical),
    );
    expect(await jwkThumbprint(withPrivate)).toBe(
      toBase64Url(new Uint8Array(digest)),
    );
  });
});

describe("deriveClientSecret", () => {
  it("is deterministic per master secret and client", async () => {
    const a = await deriveClientSecret("master", "voting");
    expect(a).toBe(await deriveClientSecret("master", "voting"));
    expect(a).not.toBe(await deriveClientSecret("master", "wavelength"));
    expect(a).not.toBe(await deriveClientSecret("other", "voting"));
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("pins the derivation so a script and the Worker always agree", async () => {
    expect(await deriveClientSecret("test-master-secret", "voting")).toBe(
      "oOIZrRtNE7OgAIDSUyMx2UIt9lDUJGoUa0IdOaoq8OI",
    );
  });
});
