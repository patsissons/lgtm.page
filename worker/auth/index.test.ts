// @vitest-environment node
import { describe, expect, it } from "vitest";
import { authMount, handleAuth } from "./index";
import { makeEnv } from "./test-env";

const env = { AUTH_HOST: "auth.lgtm.page" as const };

describe("authMount", () => {
  it("serves the auth host at its root", () => {
    expect(
      authMount(new URL("https://auth.lgtm.page/authorize?x=1"), env),
    ).toEqual({
      issuer: "https://auth.lgtm.page",
      prefix: "",
    });
    expect(authMount(new URL("https://auth.lgtm.page/"), env)?.prefix).toBe("");
  });

  it("serves /auth/* on localhost and workers.dev only", () => {
    expect(
      authMount(new URL("http://localhost:5173/auth/authorize"), env),
    ).toEqual({
      issuer: "http://localhost:5173/auth",
      prefix: "/auth",
    });
    expect(authMount(new URL("http://127.0.0.1:5198/auth/"), env)?.issuer).toBe(
      "http://127.0.0.1:5198/auth",
    );
    expect(
      authMount(
        new URL("https://pr-7-lgtm.pat.workers.dev/auth/.well-known/jwks.json"),
        env,
      )?.issuer,
    ).toBe("https://pr-7-lgtm.pat.workers.dev/auth");
    expect(authMount(new URL("http://localhost:5173/auth"), env)?.prefix).toBe(
      "/auth",
    );
    expect(authMount(new URL("http://localhost:5173/authors"), env)).toBeNull();
    expect(
      authMount(new URL("http://localhost:5173/api/apps"), env),
    ).toBeNull();
    expect(
      authMount(new URL("https://lgtm.page/auth/authorize"), env),
    ).toBeNull();
    expect(
      authMount(new URL("https://wavelength.lgtm.page/auth/"), env),
    ).toBeNull();
  });

  it("never matches a host when AUTH_HOST is unset", () => {
    expect(
      authMount(new URL("https://auth.lgtm.page/"), { AUTH_HOST: "" as never }),
    ).toBeNull();
  });
});

describe("handleAuth", () => {
  it("answers 503 (not a crash) when the secrets are missing", async () => {
    const env = await makeEnv({
      AUTH_SIGNING_KEYS: "",
      GOOGLE_CLIENT_SECRET: "",
    });
    const url = new URL(
      "https://auth.lgtm.page/.well-known/openid-configuration",
    );
    const res = await handleAuth(new Request(url), env, url, {
      issuer: url.origin,
      prefix: "",
    });
    expect(res.status).toBe(503);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({
      error: "auth_not_configured",
      error_description: "missing AUTH_SIGNING_KEYS, GOOGLE_CLIENT_SECRET",
    });
  });

  it("routes by path under the mount prefix", async () => {
    const env = await makeEnv();
    const mount = { issuer: "http://localhost:5173/auth", prefix: "/auth" };
    const call = (path: string, init?: RequestInit) => {
      const url = new URL(`http://localhost:5173${path}`);
      return handleAuth(new Request(url, init), env, url, mount);
    };
    expect((await call("/auth/")).headers.get("content-type")).toContain(
      "text/html",
    );
    expect(
      (
        (await (
          await call("/auth/.well-known/openid-configuration")
        ).json()) as { issuer: string }
      ).issuer,
    ).toBe(mount.issuer);
    expect((await call("/auth/.well-known/jwks.json")).status).toBe(200);
    expect((await call("/auth/nope")).status).toBe(404);
    expect((await call("/auth/token")).status).toBe(405);
    expect((await call("/auth/callback/facebook")).status).toBe(405);
    expect((await call("/auth/authorize")).status).toBe(400);
    expect((await call("/auth/logout")).status).toBe(200);
    const preflight = await call("/auth/token", {
      method: "OPTIONS",
      headers: { origin: "http://localhost:3000" },
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-origin")).toBe(
      "http://localhost:3000",
    );
    expect(preflight.headers.get("access-control-allow-headers")).toBe(
      "authorization, content-type",
    );
    const denied = await call("/auth/userinfo", {
      method: "OPTIONS",
      headers: { origin: "https://evil.example" },
    });
    expect(denied.status).toBe(403);
    const open = await call("/auth/.well-known/jwks.json", {
      method: "OPTIONS",
      headers: { origin: "https://evil.example" },
    });
    expect(open.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("turns an unexpected throw into a 500", async () => {
    const env = await makeEnv({ AUTH_SIGNING_KEYS: "not json" });
    const url = new URL("https://auth.lgtm.page/.well-known/jwks.json");
    const errors: unknown[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => errors.push(args);
    try {
      const res = await handleAuth(new Request(url), env, url, {
        issuer: url.origin,
        prefix: "",
      });
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: "server_error" });
      expect(errors).toHaveLength(1);
    } finally {
      console.error = original;
    }
  });
});
