// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleAuthorize } from "./authorize";
import { openCode } from "./code";
import {
  SESSION_COOKIE,
  TXN_COOKIE,
  TXN_TTL,
  openTxn,
  sealSession,
} from "./session";
import {
  DEV_MOUNT,
  IDENTITY,
  PROD_MOUNT,
  makeEnv,
  pkce,
  setCookies,
  type TestEnv,
} from "./test-env";

const NOW = 1_800_000_000;
const REDIRECT = "https://wavelength.lgtm.page/cb";

function request(params: Record<string, string>, cookie?: string) {
  const url = new URL("https://auth.lgtm.page/authorize");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return {
    url,
    req: new Request(url, { headers: cookie ? { cookie } : {} }),
  };
}

async function authorize(
  env: TestEnv,
  params: Record<string, string>,
  cookie?: string,
  mount = PROD_MOUNT,
) {
  const { url, req } = request(params, cookie);
  return handleAuthorize(req, env, url, mount);
}

const BASE = {
  client_id: "wavelength",
  redirect_uri: REDIRECT,
  response_type: "code",
  state: "xyz",
};

let env: TestEnv;
beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW * 1000);
  env = await makeEnv();
});
afterEach(() => vi.useRealTimers());

describe("/authorize validation", () => {
  it("shows a page, never a redirect, for an unknown client or bad redirect_uri", async () => {
    let res = await authorize(env, { ...BASE, client_id: "nope" });
    expect(res.status).toBe(400);
    expect(res.headers.get("location")).toBeNull();
    expect(await res.text()).toContain("Unknown app");
    res = await authorize(env, {
      ...BASE,
      redirect_uri: "https://evil.example/",
    });
    expect(res.status).toBe(400);
    expect(await res.text()).toContain("Bad redirect");
    res = await authorize(env, { client_id: "wavelength" });
    expect(res.status).toBe(400);
  });

  it("reports later errors to the app with state and iss", async () => {
    const cases: [Record<string, string>, string][] = [
      [{ response_type: "token" }, "unsupported_response_type"],
      [{ code_challenge: "x".repeat(43) }, "invalid_request"],
      [
        { code_challenge: "x".repeat(43), code_challenge_method: "plain" },
        "invalid_request",
      ],
      [
        { code_challenge: "short", code_challenge_method: "S256" },
        "invalid_request",
      ],
      [{ code_challenge_method: "S256" }, "invalid_request"],
      [{ prompt: "consent" }, "invalid_request"],
      [{ provider: "facebook" }, "invalid_request"],
      [{ nonce: "n".repeat(513) }, "invalid_request"],
      [{ prompt: "none" }, "login_required"],
    ];
    for (const [extra, error] of cases) {
      const res = await authorize(env, { ...BASE, ...extra });
      expect(res.status, JSON.stringify(extra)).toBe(302);
      const location = new URL(res.headers.get("location")!);
      expect(location.origin + location.pathname).toBe(REDIRECT);
      expect(location.searchParams.get("error")).toBe(error);
      expect(location.searchParams.get("state")).toBe("xyz");
      expect(location.searchParams.get("iss")).toBe(PROD_MOUNT.issuer);
    }
  });

  it("drops an oversized state from the error redirect", async () => {
    const res = await authorize(env, { ...BASE, state: "s".repeat(513) });
    const location = new URL(res.headers.get("location")!);
    expect(location.searchParams.get("error")).toBe("invalid_request");
    expect(location.searchParams.has("state")).toBe(false);
  });
});

describe("/authorize without a session", () => {
  it("renders the chooser with one link per provider", async () => {
    const res = await authorize(env, { ...BASE, scope: "openid email" });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    const body = await res.text();
    expect(body).toContain("Sign in to wavelength");
    expect(body).toContain("prefers-color-scheme: dark");
    for (const provider of ["github", "google"]) {
      const match = body.match(
        new RegExp(`href="([^"]+provider=${provider}[^"]*)"`),
      );
      expect(match, provider).not.toBeNull();
      const link = new URL(match![1].replace(/&amp;/g, "&"));
      expect(link.origin + link.pathname).toBe(
        "https://auth.lgtm.page/authorize",
      );
      expect(link.searchParams.get("client_id")).toBe("wavelength");
      expect(link.searchParams.get("state")).toBe("xyz");
      expect(link.searchParams.get("scope")).toBe("openid email");
    }
  });

  it("escapes the client id in the chooser", async () => {
    const res = await authorize(env, {
      ...BASE,
      client_id: "tiki.place",
      redirect_uri: "https://tiki.place/",
    });
    expect(await res.text()).toContain("Sign in to tiki.place");
  });

  it("sends the user to the provider with a sealed txn cookie", async () => {
    const { challenge } = await pkce();
    const res = await authorize(env, {
      ...BASE,
      provider: "github",
      nonce: "nn",
      code_challenge: challenge,
      code_challenge_method: "S256",
    });
    expect(res.status).toBe(302);
    const location = new URL(res.headers.get("location")!);
    expect(location.origin + location.pathname).toBe(
      "https://github.com/login/oauth/authorize",
    );
    expect(location.searchParams.get("client_id")).toBe("gh-client");
    expect(location.searchParams.get("redirect_uri")).toBe(
      "https://auth.lgtm.page/callback/github",
    );
    expect(location.searchParams.get("scope")).toBe("read:user user:email");
    expect(location.searchParams.has("prompt")).toBe(false);
    const cookie = res.headers.get("set-cookie")!;
    expect(cookie).toContain(`${TXN_COOKIE}=`);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain(`Max-Age=${TXN_TTL}`);
    const txn = await openTxn(env, setCookies(res)[TXN_COOKIE], NOW);
    expect(txn).toMatchObject({
      client_id: "wavelength",
      redirect_uri: REDIRECT,
      state: "xyz",
      nonce: "nn",
      scope: "openid",
      code_challenge: challenge,
      provider: "github",
      exp: NOW + TXN_TTL,
    });
    expect(txn?.id).toBe(location.searchParams.get("state"));
  });

  it("rebases the provider onto AUTH_PROVIDER_ORIGIN and drops Secure on http", async () => {
    const stubbed = await makeEnv({
      AUTH_PROVIDER_ORIGIN: "http://localhost:5199",
    });
    const url = new URL("http://localhost:5173/auth/authorize");
    for (const [k, v] of Object.entries({
      ...BASE,
      provider: "google",
      prompt: "login",
    })) {
      url.searchParams.set(k, v);
    }
    const res = await handleAuthorize(
      new Request(url),
      stubbed,
      url,
      DEV_MOUNT,
    );
    const location = new URL(res.headers.get("location")!);
    expect(location.origin + location.pathname).toBe(
      "http://localhost:5199/o/oauth2/v2/auth",
    );
    expect(location.searchParams.get("redirect_uri")).toBe(
      "http://localhost:5173/auth/callback/google",
    );
    expect(location.searchParams.get("prompt")).toBe("select_account");
    expect(res.headers.get("set-cookie")).not.toContain("Secure");
  });
});

describe("/authorize with a broker session", () => {
  async function sessionCookie(identity = IDENTITY) {
    const sealed = await sealSession(env, {
      identity,
      auth_time: NOW - 1000,
      exp: NOW + 1000,
    });
    return `${SESSION_COOKIE}=${sealed}`;
  }

  it("skips the provider and returns a code bound to the request", async () => {
    const { challenge } = await pkce();
    const res = await authorize(
      env,
      {
        ...BASE,
        nonce: "n1",
        code_challenge: challenge,
        code_challenge_method: "S256",
      },
      await sessionCookie(),
    );
    expect(res.status).toBe(302);
    const location = new URL(res.headers.get("location")!);
    expect(location.origin + location.pathname).toBe(REDIRECT);
    expect(location.searchParams.get("state")).toBe("xyz");
    const code = await openCode(env, location.searchParams.get("code"), NOW);
    expect(code).toMatchObject({
      client_id: "wavelength",
      redirect_uri: REDIRECT,
      nonce: "n1",
      code_challenge: challenge,
      identity: IDENTITY,
      auth_time: NOW - 1000,
    });
  });

  it("honours prompt=none, prompt=login and a provider mismatch", async () => {
    const cookie = await sessionCookie();
    let res = await authorize(env, { ...BASE, prompt: "none" }, cookie);
    expect(new URL(res.headers.get("location")!).searchParams.has("code")).toBe(
      true,
    );

    res = await authorize(env, { ...BASE, prompt: "login" }, cookie);
    expect(res.status).toBe(200); // chooser again

    res = await authorize(env, { ...BASE, provider: "google" }, cookie);
    expect(new URL(res.headers.get("location")!).hostname).toBe(
      "accounts.google.com",
    );

    res = await authorize(env, { ...BASE, provider: "github" }, cookie);
    expect(new URL(res.headers.get("location")!).searchParams.has("code")).toBe(
      true,
    );
  });

  it("ignores an expired or tampered session cookie", async () => {
    const expired = await sealSession(env, {
      identity: IDENTITY,
      auth_time: NOW - 100,
      exp: NOW - 1,
    });
    let res = await authorize(env, BASE, `${SESSION_COOKIE}=${expired}`);
    expect(res.status).toBe(200);
    res = await authorize(env, BASE, `${SESSION_COOKIE}=garbage`);
    expect(res.status).toBe(200);
  });
});
