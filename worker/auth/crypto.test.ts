// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  open,
  randomToken,
  seal,
  sha256Base64Url,
  timingSafeEqual,
} from "./crypto";

const MASTER = "test-master-secret";

describe("seal/open", () => {
  it("round-trips a payload", async () => {
    const sealed = await seal(MASTER, "session", { a: 1, b: "two" });
    expect(sealed).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(await open(MASTER, "session", sealed)).toEqual({ a: 1, b: "two" });
  });

  it("uses a fresh iv every time", async () => {
    const a = await seal(MASTER, "code", { x: 1 });
    const b = await seal(MASTER, "code", { x: 1 });
    expect(a).not.toBe(b);
  });

  it("rejects tampering, the wrong master secret and the wrong purpose", async () => {
    const sealed = await seal(MASTER, "code", { x: 1 });
    const tampered = sealed.slice(0, -2) + (sealed.endsWith("A") ? "BB" : "AA");
    expect(await open(MASTER, "code", tampered)).toBeNull();
    expect(await open("other-secret", "code", sealed)).toBeNull();
    expect(await open(MASTER, "session", sealed)).toBeNull();
    expect(await open(MASTER, "txn", sealed)).toBeNull();
  });

  it("rejects garbage and empty values", async () => {
    expect(await open(MASTER, "code", undefined)).toBeNull();
    expect(await open(MASTER, "code", "")).toBeNull();
    expect(await open(MASTER, "code", "short")).toBeNull();
    expect(await open(MASTER, "code", "not base64url!")).toBeNull();
  });
});

describe("primitives", () => {
  it("randomToken is 32 random bytes, base64url", () => {
    expect(randomToken()).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(randomToken()).not.toBe(randomToken());
    expect(randomToken(16)).toHaveLength(22);
  });

  it("sha256Base64Url matches the PKCE S256 example from RFC 7636", async () => {
    expect(
      await sha256Base64Url("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
    ).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });

  it("timingSafeEqual compares whole strings", () => {
    expect(timingSafeEqual("abc", "abc")).toBe(true);
    expect(timingSafeEqual("abc", "abd")).toBe(false);
    expect(timingSafeEqual("abc", "ab")).toBe(false);
    expect(timingSafeEqual("", "")).toBe(true);
  });
});
