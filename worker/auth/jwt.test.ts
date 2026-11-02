// @vitest-environment node
import { describe, expect, it } from "vitest";
import { base64UrlToUtf8, utf8ToBase64Url } from "@shared/auth";
import {
  decodeJwtPayload,
  loadSigningKeys,
  publicJwks,
  signJwt,
  verifyJwt,
} from "./jwt";
import { generateSigningJwk, testSigningKeys } from "./test-env";

const ISSUER = "https://auth.lgtm.page";
const NOW = 1_800_000_000;

function claims(overrides: Record<string, unknown> = {}) {
  return {
    iss: ISSUER,
    sub: "github:1",
    aud: "wavelength",
    iat: NOW,
    exp: NOW + 3600,
    ...overrides,
  };
}

describe("loadSigningKeys", () => {
  it("imports every key and publishes only the public halves", async () => {
    const { keys } = await testSigningKeys(2);
    expect(keys).toHaveLength(2);
    const jwks = publicJwks(keys);
    for (const jwk of jwks.keys) {
      expect(jwk).toMatchObject({
        kty: "EC",
        crv: "P-256",
        use: "sig",
        alg: "ES256",
      });
      expect(jwk.kid).toBeTruthy();
      expect(jwk).not.toHaveProperty("d");
    }
  });

  it("memoises per raw value", async () => {
    const { raw } = await testSigningKeys();
    expect(loadSigningKeys(raw)).toBe(loadSigningKeys(raw));
  });

  it("rejects malformed secrets", async () => {
    await expect(loadSigningKeys("nope")).rejects.toThrow(/not JSON/);
    await expect(loadSigningKeys("[]")).rejects.toThrow(/non-empty/);
    const jwk = await generateSigningJwk();
    await expect(
      loadSigningKeys(JSON.stringify([{ ...jwk, kid: undefined }])),
    ).rejects.toThrow(/AUTH_SIGNING_KEYS\[0\]/);
    await expect(
      loadSigningKeys(JSON.stringify([{ ...jwk, d: undefined }])),
    ).rejects.toThrow(/private P-256/);
  });
});

describe("signJwt/verifyJwt", () => {
  it("signs with the first key and verifies with the kid it names", async () => {
    const { keys } = await testSigningKeys(2);
    const token = await signJwt(keys[0], "JWT", claims({ nonce: "n" }));
    const [header] = token.split(".");
    expect(JSON.parse(base64UrlToUtf8(header)!)).toEqual({
      alg: "ES256",
      typ: "JWT",
      kid: keys[0].kid,
    });
    const verified = await verifyJwt(token, keys, { issuer: ISSUER, now: NOW });
    expect(verified?.claims).toEqual(claims({ nonce: "n" }));
    expect(verified?.header.typ).toBe("JWT");
    // Still verifies after rotation, as long as the old key is published.
    expect(
      await verifyJwt(token, [keys[1], keys[0]], { issuer: ISSUER, now: NOW }),
    ).not.toBeNull();
  });

  it("rejects an unknown kid, a bad signature, expiry and the wrong issuer", async () => {
    const { keys } = await testSigningKeys();
    const { keys: others } = await testSigningKeys();
    const token = await signJwt(keys[0], "at+jwt", claims());
    const expect_ = (t: string, now = NOW, issuer = ISSUER) =>
      verifyJwt(t, keys, { issuer, now });
    expect(
      await verifyJwt(token, others, { issuer: ISSUER, now: NOW }),
    ).toBeNull();
    expect(await expect_(token.slice(0, -3) + "AAA")).toBeNull();
    expect(await expect_(token, NOW + 3600)).toBeNull();
    expect(await expect_(token, NOW, "https://evil.example")).toBeNull();
    expect(await expect_("a.b")).toBeNull();
    expect(await expect_("a.b.c")).toBeNull();
  });

  it("rejects alg confusion and foreign typ values", async () => {
    const { keys } = await testSigningKeys();
    const token = await signJwt(keys[0], "JWT", claims());
    const [, payload, signature] = token.split(".");
    const forge = (header: object) =>
      `${utf8ToBase64Url(JSON.stringify(header))}.${payload}.${signature}`;
    expect(
      await verifyJwt(
        forge({ alg: "none", typ: "JWT", kid: keys[0].kid }),
        keys,
        {
          issuer: ISSUER,
          now: NOW,
        },
      ),
    ).toBeNull();
    expect(
      await verifyJwt(
        forge({ alg: "HS256", typ: "JWT", kid: keys[0].kid }),
        keys,
        {
          issuer: ISSUER,
          now: NOW,
        },
      ),
    ).toBeNull();
  });
});

describe("decodeJwtPayload", () => {
  it("decodes without verifying", () => {
    const payload = utf8ToBase64Url(JSON.stringify({ sub: "1" }));
    expect(decodeJwtPayload(`x.${payload}.y`)).toEqual({ sub: "1" });
    expect(decodeJwtPayload("x.y")).toBeNull();
    expect(decodeJwtPayload("x.!!.y")).toBeNull();
  });
});
