// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  CLIENT_ID,
  LOGIN_COOKIE,
  SESSION_COOKIE,
  SESSION_TTL,
  handleAccount,
  issuerFor,
  openAccount,
} from "./account";
import { mintCode } from "./auth/code";
import { nowSeconds, seal } from "./auth/crypto";
import {
  IDENTITY,
  cookieHeaderFrom,
  makeEnv,
  setCookies,
} from "./auth/test-env";

const ORIGIN = "https://lgtm.page";
const DEV = "http://localhost:5173";

function call(
  env: Awaited<ReturnType<typeof makeEnv>>,
  path: string,
  init: RequestInit & { cookies?: Record<string, string> } = {},
) {
  const url = new URL(path, ORIGIN);
  const headers = new Headers(init.headers);
  if (init.cookies) headers.set("cookie", cookieHeaderFrom(init.cookies));
  return handleAccount(new Request(url, { ...init, headers }), env, url);
}

/** Starts a login and returns what the browser would hold. */
async function startLogin(env: Awaited<ReturnType<typeof makeEnv>>) {
  const res = await call(env, "/api/auth/login?provider=github");
  const target = new URL(res.headers.get("location")!);
  const cookies = setCookies(res);
  return { res, target, cookies };
}

describe("issuerFor", () => {
  const env = { AUTH_HOST: "auth.lgtm.page" as const };
  it("uses the path mount on dev hosts and the auth host elsewhere", () => {
    expect(
      issuerFor(new URL("http://localhost:5173/api/auth/login"), env),
    ).toBe("http://localhost:5173/auth");
    expect(issuerFor(new URL("http://127.0.0.1:5198/"), env)).toBe(
      "http://127.0.0.1:5198/auth",
    );
    expect(issuerFor(new URL("https://pr-3-lgtm.pat.workers.dev/"), env)).toBe(
      "https://pr-3-lgtm.pat.workers.dev/auth",
    );
    expect(issuerFor(new URL("https://lgtm.page/"), env)).toBe(
      "https://auth.lgtm.page",
    );
    expect(issuerFor(new URL("https://www.lgtm.page/"), env)).toBe(
      "https://auth.lgtm.page",
    );
  });
});

describe("GET /api/auth/login", () => {
  it("sends the browser to the broker with PKCE and a sealed login cookie", async () => {
    const env = await makeEnv();
    const { res, target, cookies } = await startLogin(env);
    expect(res.status).toBe(302);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(target.origin + target.pathname).toBe(
      "https://auth.lgtm.page/authorize",
    );
    const q = target.searchParams;
    expect(q.get("client_id")).toBe(CLIENT_ID);
    expect(q.get("redirect_uri")).toBe("https://lgtm.page/api/auth/callback");
    expect(q.get("response_type")).toBe("code");
    expect(q.get("scope")).toBe("openid email profile");
    expect(q.get("code_challenge_method")).toBe("S256");
    expect(q.get("code_challenge")).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(q.get("provider")).toBe("github");
    expect(q.get("state")).toBeTruthy();
    expect(q.get("nonce")).toBeTruthy();
    expect(cookies[LOGIN_COOKIE]).toBeTruthy();
    const header = res.headers.get("set-cookie")!;
    expect(header).toContain("HttpOnly");
    expect(header).toContain("SameSite=Lax");
    expect(header).toContain("Secure");
    expect(header).toContain("Max-Age=600");
  });

  it("omits provider when none is asked for and rejects unknown ones", async () => {
    const env = await makeEnv();
    const res = await call(env, "/api/auth/login");
    expect(
      new URL(res.headers.get("location")!).searchParams.has("provider"),
    ).toBe(false);
    const bad = await call(env, "/api/auth/login?provider=facebook");
    expect(bad.status).toBe(400);
  });

  it("uses the dev mount and a non-Secure cookie on localhost", async () => {
    const env = await makeEnv();
    const url = new URL(`${DEV}/api/auth/login`);
    const res = await handleAccount(new Request(url), env, url);
    const target = new URL(res.headers.get("location")!);
    expect(target.href.startsWith(`${DEV}/auth/authorize?`)).toBe(true);
    expect(target.searchParams.get("redirect_uri")).toBe(
      `${DEV}/api/auth/callback`,
    );
    expect(res.headers.get("set-cookie")).not.toContain("Secure");
  });
});

describe("GET /api/auth/callback", () => {
  /** Mints the code the broker would have issued for this login. */
  async function codeFor(
    env: Awaited<ReturnType<typeof makeEnv>>,
    target: URL,
    overrides: Partial<Parameters<typeof mintCode>[1]> = {},
  ) {
    const q = target.searchParams;
    return mintCode(env, {
      client_id: CLIENT_ID,
      redirect_uri: q.get("redirect_uri")!,
      code_challenge: q.get("code_challenge")!,
      nonce: q.get("nonce")!,
      scope: "openid email profile",
      identity: IDENTITY,
      auth_time: nowSeconds(),
      ...overrides,
    });
  }

  it("redeems the code in-process, verifies the id_token and sets the session", async () => {
    const env = await makeEnv();
    const { target, cookies } = await startLogin(env);
    const code = await codeFor(env, target);
    const res = await call(
      env,
      `/api/auth/callback?code=${encodeURIComponent(code)}&state=${target.searchParams.get("state")}`,
      { cookies },
    );
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/");
    const set = setCookies(res);
    expect(set[LOGIN_COOKIE]).toBe("");
    expect(set[SESSION_COOKIE]).toBeTruthy();
    const session = await openAccount(env, set[SESSION_COOKIE]);
    expect(session).toMatchObject({
      sub: "github:42",
      provider: "github",
      name: "Pat",
      email: "pat@example.com",
      picture: "https://avatars.example/42",
      preferred_username: "pat",
    });
    expect(session!.exp).toBeGreaterThan(nowSeconds() + SESSION_TTL - 5);
    // The broker burned the code: exactly one KV write.
    expect(env.AUTH_KV.writes).toHaveLength(1);
  });

  it("rejects a state that does not match the login cookie", async () => {
    const env = await makeEnv();
    const { target, cookies } = await startLogin(env);
    const code = await codeFor(env, target);
    const res = await call(
      env,
      `/api/auth/callback?code=${encodeURIComponent(code)}&state=other`,
      { cookies },
    );
    expect(res.status).toBe(400);
    expect(await res.text()).toContain("Sign-in expired");
    expect(setCookies(res)[LOGIN_COOKIE]).toBe("");
  });

  it("needs the login cookie", async () => {
    const env = await makeEnv();
    const res = await call(env, "/api/auth/callback?code=x&state=y");
    expect(res.status).toBe(400);
  });

  it("relays a provider error to the page", async () => {
    const env = await makeEnv();
    const { target, cookies } = await startLogin(env);
    const res = await call(
      env,
      `/api/auth/callback?error=access_denied&state=${target.searchParams.get("state")}`,
      { cookies },
    );
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/?auth_error=access_denied");
    expect(setCookies(res)[SESSION_COOKIE]).toBeUndefined();
  });

  it("refuses a code minted for another nonce or client", async () => {
    const env = await makeEnv();
    const { target, cookies } = await startLogin(env);
    const state = target.searchParams.get("state");
    const wrongNonce = await codeFor(env, target, { nonce: "other" });
    const res = await call(
      env,
      `/api/auth/callback?code=${encodeURIComponent(wrongNonce)}&state=${state}`,
      { cookies },
    );
    expect(res.headers.get("location")).toBe("/?auth_error=invalid_token");
    expect(setCookies(res)[SESSION_COOKIE]).toBeUndefined();

    const wrongClient = await codeFor(env, target, { client_id: "wavelength" });
    const res2 = await call(
      env,
      `/api/auth/callback?code=${encodeURIComponent(wrongClient)}&state=${state}`,
      { cookies },
    );
    expect(res2.headers.get("location")).toBe("/?auth_error=invalid_grant");
  });
});

describe("GET /api/auth/me", () => {
  it("is null without a session and the user with one", async () => {
    const env = await makeEnv();
    const anon = await call(env, "/api/auth/me");
    expect(anon.headers.get("cache-control")).toBe("no-store");
    expect(await anon.json()).toEqual({ user: null });

    const sealed = await seal(env.AUTH_MASTER_SECRET, "account", {
      sub: "google:1",
      provider: "google",
      name: "Pat",
      email: "pat@gmail.example",
      picture: "https://lh3.example/1",
      exp: nowSeconds() + 60,
    });
    const me = await call(env, "/api/auth/me", {
      cookies: { [SESSION_COOKIE]: sealed },
    });
    expect(await me.json()).toEqual({
      user: {
        sub: "google:1",
        provider: "google",
        name: "Pat",
        email: "pat@gmail.example",
        picture: "https://lh3.example/1",
      },
    });
  });

  it("ignores an expired, tampered or foreign-purpose cookie", async () => {
    const env = await makeEnv();
    const expired = await seal(env.AUTH_MASTER_SECRET, "account", {
      sub: "github:1",
      provider: "github",
      exp: nowSeconds() - 1,
    });
    const asSession = await seal(env.AUTH_MASTER_SECRET, "session", {
      sub: "github:1",
      provider: "github",
      exp: nowSeconds() + 60,
    });
    for (const value of [expired, asSession, "garbage"]) {
      const res = await call(env, "/api/auth/me", {
        cookies: { [SESSION_COOKIE]: value },
      });
      expect(await res.json()).toEqual({ user: null });
    }
  });
});

describe("POST /api/auth/logout", () => {
  it("clears the session and ends the broker session", async () => {
    const env = await makeEnv();
    const res = await call(env, "/api/auth/logout", { method: "POST" });
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(
      "https://auth.lgtm.page/logout?client_id=lgtm&post_logout_redirect_uri=https%3A%2F%2Flgtm.page%2F",
    );
    expect(res.headers.get("set-cookie")).toContain(`${SESSION_COOKIE}=;`);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("is POST only", async () => {
    const env = await makeEnv();
    expect((await call(env, "/api/auth/logout")).status).toBe(405);
    expect((await call(env, "/api/auth/nope")).status).toBe(404);
  });
});
