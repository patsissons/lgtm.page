// @vitest-environment node
import { describe, expect, it } from "vitest";
import { clearCookieHeader, cookieHeader, parseCookies } from "./cookies";

describe("cookies", () => {
  it("parses a Cookie header", () => {
    expect(parseCookies("a=1; b=x=y;  c =3")).toEqual({
      a: "1",
      b: "x=y",
      c: "3",
    });
    expect(parseCookies(null)).toEqual({});
    expect(parseCookies("junk")).toEqual({});
  });

  it("writes HttpOnly Lax cookies, Secure only on https", () => {
    expect(cookieHeader("s", "v", { maxAge: 60, secure: true })).toBe(
      "s=v; Path=/; HttpOnly; SameSite=Lax; Max-Age=60; Secure",
    );
    expect(cookieHeader("s", "v", { maxAge: 60, secure: false })).toBe(
      "s=v; Path=/; HttpOnly; SameSite=Lax; Max-Age=60",
    );
  });

  it("clears with Max-Age=0", () => {
    expect(clearCookieHeader("s", true)).toBe(
      "s=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Secure",
    );
  });
});
