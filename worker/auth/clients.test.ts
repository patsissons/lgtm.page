// @vitest-environment node
import { describe, expect, it } from "vitest";
import { deriveClientSecret } from "@shared/auth";
import {
  findClient,
  INDEX_CLIENT,
  isAllowedOrigin,
  isAllowedRedirect,
  verifyClientSecret,
} from "./clients";

const REGISTRY = [
  { slug: "wavelength", url: "https://wavelength.lgtm.page/" },
  { slug: "tiki.place", url: "https://tiki.place/play?x=1" },
];

describe("findClient", () => {
  it("maps a registry slug to its origin", () => {
    expect(findClient("wavelength", REGISTRY)).toEqual({
      id: "wavelength",
      origin: "https://wavelength.lgtm.page",
    });
    expect(findClient("tiki.place", REGISTRY)?.origin).toBe(
      "https://tiki.place",
    );
    expect(findClient("nope", REGISTRY)).toBeNull();
    expect(findClient(null, REGISTRY)).toBeNull();
    expect(findClient("", REGISTRY)).toBeNull();
  });

  it("uses the real registry by default", () => {
    expect(findClient("wavelength")?.origin).toBe(
      "https://wavelength.lgtm.page",
    );
  });
});

describe("the built-in index client", () => {
  it("is lgtm on https://lgtm.page, outside the registry", () => {
    expect(findClient("lgtm", [])).toEqual(INDEX_CLIENT);
    expect(INDEX_CLIENT).toEqual({ id: "lgtm", origin: "https://lgtm.page" });
    expect(
      isAllowedRedirect(INDEX_CLIENT, "https://lgtm.page/api/auth/callback"),
    ).toBe(true);
    expect(
      isAllowedRedirect(
        INDEX_CLIENT,
        "https://www.lgtm.page/api/auth/callback",
      ),
    ).toBe(false);
    expect(isAllowedOrigin("https://lgtm.page", [])).toBe(true);
  });
});

describe("isAllowedRedirect", () => {
  const client = findClient("wavelength", REGISTRY)!;
  const cases: [string, boolean][] = [
    ["https://wavelength.lgtm.page/", true],
    ["https://wavelength.lgtm.page/auth/callback?x=1", true],
    ["https://wavelength.lgtm.page", true],
    ["http://wavelength.lgtm.page/", false],
    ["https://wavelength.lgtm.page:8443/", false],
    ["https://evil.lgtm.page/", false],
    ["https://wavelength.lgtm.page.evil.com/", false],
    ["https://tiki.place/", false],
    ["https://wavelength.lgtm.page/#frag", false],
    ["https://wavelength.lgtm.page/#", false],
    ["http://localhost/cb", true],
    ["http://localhost:5173/cb", true],
    ["http://127.0.0.1:3000/", true],
    ["http://[::1]:3000/", true],
    ["https://localhost:5173/cb", false],
    ["http://localhost.evil.com/", false],
    ["not a url", false],
    ["javascript:alert(1)", false],
  ];
  it.each(cases)("%s -> %s", (uri, allowed) => {
    expect(isAllowedRedirect(client, uri)).toBe(allowed);
  });
});

describe("isAllowedOrigin", () => {
  it("accepts registry origins and loopback only", () => {
    expect(isAllowedOrigin("https://wavelength.lgtm.page", REGISTRY)).toBe(
      true,
    );
    expect(isAllowedOrigin("https://tiki.place", REGISTRY)).toBe(true);
    expect(isAllowedOrigin("http://localhost:5173", REGISTRY)).toBe(true);
    expect(isAllowedOrigin("https://evil.example", REGISTRY)).toBe(false);
    expect(isAllowedOrigin("https://wavelength.lgtm.page/", REGISTRY)).toBe(
      false,
    );
    expect(isAllowedOrigin("null", REGISTRY)).toBe(false);
    expect(isAllowedOrigin(null, REGISTRY)).toBe(false);
  });
});

describe("verifyClientSecret", () => {
  it("accepts the derived secret and nothing else", async () => {
    const secret = await deriveClientSecret("master", "voting");
    expect(await verifyClientSecret("master", "voting", secret)).toBe(true);
    expect(await verifyClientSecret("master", "voting", secret + "x")).toBe(
      false,
    );
    expect(await verifyClientSecret("master", "wavelength", secret)).toBe(
      false,
    );
    expect(await verifyClientSecret("master", "voting", "")).toBe(false);
  });
});
