// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { utf8ToBase64Url } from "@shared/auth";
import { handleCallback } from "./callback";
import { openCode } from "./code";
import { SESSION_COOKIE, TXN_COOKIE, openSession, sealTxn } from "./session";
import { PROD_MOUNT, makeEnv, setCookies, type TestEnv } from "./test-env";
import type { AuthRequest, Provider } from "./types";

const NOW = 1_800_000_000;
const REDIRECT = "https://wavelength.lgtm.page/cb";

function txnFor(
  provider: Provider,
  extra: Partial<AuthRequest> = {},
): AuthRequest {
  return {
    id: "txn-1",
    client_id: "wavelength",
    redirect_uri: REDIRECT,
    state: "st",
    nonce: "no",
    scope: "openid",
    provider,
    exp: NOW + 100,
    ...extra,
  };
}

type Handler = (url: URL, init?: RequestInit) => Response | Promise<Response>;

/** A fetch that answers the provider endpoints by path. */
function providerFetch(
  routes: Record<string, Handler>,
  calls: { url: string; init?: RequestInit }[] = [],
) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url,
    );
    calls.push({ url: url.href, init });
    const handler = routes[url.pathname];
    if (!handler) return new Response("nope", { status: 404 });
    return handler(url, init);
  }) as unknown as typeof fetch;
}

const GITHUB_ROUTES: Record<string, Handler> = {
  "/login/oauth/access_token": () =>
    Response.json({ access_token: "gh-token", token_type: "bearer" }),
  "/user": () =>
    Response.json({
      id: 42,
      login: "pat",
      name: "Pat",
      avatar_url: "https://avatars.example/42",
    }),
  "/user/emails": () =>
    Response.json([
      { email: "old@example.com", primary: false, verified: true },
      { email: "pat@example.com", primary: true, verified: true },
      { email: "spoof@example.com", primary: false, verified: false },
    ]),
};

function googleIdToken(claims: Record<string, unknown>) {
  return `${utf8ToBase64Url(JSON.stringify({ alg: "none" }))}.${utf8ToBase64Url(JSON.stringify(claims))}.sig`;
}

const GOOGLE_CLAIMS = {
  iss: "https://accounts.google.com",
  aud: "google-client",
  sub: "1234567890",
  email: "pat@gmail.com",
  email_verified: true,
  name: "Pat S",
  picture: "https://lh3.example/p",
};

async function callback(
  env: TestEnv,
  provider: Provider,
  txn: AuthRequest | null,
  query: Record<string, string>,
  fetcher: typeof fetch,
) {
  const url = new URL(`https://auth.lgtm.page/callback/${provider}`);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  const headers: Record<string, string> = {};
  if (txn) headers.cookie = `${TXN_COOKIE}=${await sealTxn(env, txn)}`;
  return handleCallback(
    new Request(url, { headers }),
    env,
    url,
    PROD_MOUNT,
    provider,
    fetcher,
  );
}

let env: TestEnv;
beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW * 1000);
  env = await makeEnv();
});
afterEach(() => vi.useRealTimers());

describe("/callback/github", () => {
  it("exchanges the code, picks the primary verified email and returns a code", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fetcher = providerFetch(GITHUB_ROUTES, calls);
    const res = await callback(
      env,
      "github",
      txnFor("github"),
      { code: "gh-code", state: "txn-1" },
      fetcher,
    );
    expect(res.status).toBe(302);

    const token = calls.find((c) =>
      c.url.includes("/login/oauth/access_token"),
    )!;
    expect(token.init?.method).toBe("POST");
    const body = new URLSearchParams(String(token.init?.body));
    expect(body.get("code")).toBe("gh-code");
    expect(body.get("client_id")).toBe("gh-client");
    expect(body.get("client_secret")).toBe("gh-secret");
    expect(body.get("redirect_uri")).toBe(
      "https://auth.lgtm.page/callback/github",
    );
    const user = calls.find((c) => c.url.endsWith("/user"))!;
    expect(new Headers(user.init?.headers).get("authorization")).toBe(
      "Bearer gh-token",
    );

    const location = new URL(res.headers.get("location")!);
    expect(location.origin + location.pathname).toBe(REDIRECT);
    expect(location.searchParams.get("state")).toBe("st");
    expect(location.searchParams.get("iss")).toBe(PROD_MOUNT.issuer);
    const code = await openCode(env, location.searchParams.get("code"), NOW);
    expect(code?.identity).toEqual({
      sub: "github:42",
      provider: "github",
      provider_id: "42",
      email: "pat@example.com",
      email_verified: true,
      name: "Pat",
      picture: "https://avatars.example/42",
      preferred_username: "pat",
    });
    expect(code?.nonce).toBe("no");
    expect(code?.auth_time).toBe(NOW);

    const cookies = setCookies(res);
    expect(cookies[TXN_COOKIE]).toBe("");
    const session = await openSession(env, cookies[SESSION_COOKIE], NOW);
    expect(session?.identity.sub).toBe("github:42");
    expect(session?.auth_time).toBe(NOW);
    expect(
      res.headers.getSetCookie().find((c) => c.startsWith(SESSION_COOKIE)),
    ).toContain("Secure");
  });

  it("signs in without an email when none is verified", async () => {
    const fetcher = providerFetch({
      ...GITHUB_ROUTES,
      "/user/emails": () => new Response("forbidden", { status: 403 }),
    });
    const res = await callback(
      env,
      "github",
      txnFor("github"),
      { code: "c", state: "txn-1" },
      fetcher,
    );
    const code = await openCode(
      env,
      new URL(res.headers.get("location")!).searchParams.get("code"),
      NOW,
    );
    expect(code?.identity.email).toBeUndefined();
    expect(code?.identity.email_verified).toBe(false);
  });

  it("relays a provider denial and an exchange failure to the app", async () => {
    let res = await callback(
      env,
      "github",
      txnFor("github"),
      { error: "access_denied", state: "txn-1" },
      providerFetch({}),
    );
    let location = new URL(res.headers.get("location")!);
    expect(location.searchParams.get("error")).toBe("access_denied");
    expect(location.searchParams.get("state")).toBe("st");
    expect(setCookies(res)[TXN_COOKIE]).toBe("");

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    res = await callback(
      env,
      "github",
      txnFor("github"),
      { code: "c", state: "txn-1" },
      providerFetch({
        "/login/oauth/access_token": () =>
          Response.json({ error: "bad_verification_code" }),
      }),
    );
    location = new URL(res.headers.get("location")!);
    expect(location.searchParams.get("error")).toBe("server_error");
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("refuses without a matching txn cookie (no redirect, cookie cleared)", async () => {
    const fetcher = providerFetch(GITHUB_ROUTES);
    for (const [txn, query] of [
      [null, { code: "c", state: "txn-1" }],
      [txnFor("github"), { code: "c", state: "other" }],
      [txnFor("google"), { code: "c", state: "txn-1" }],
      [txnFor("github", { exp: NOW - 1 }), { code: "c", state: "txn-1" }],
    ] as const) {
      const res = await callback(env, "github", txn, query, fetcher);
      expect(res.status).toBe(400);
      expect(res.headers.get("location")).toBeNull();
      expect(await res.text()).toContain("Sign-in expired");
      expect(setCookies(res)[TXN_COOKIE]).toBe("");
    }
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe("/callback/google", () => {
  it("reads the identity from the id_token", async () => {
    const fetcher = providerFetch({
      "/token": () =>
        Response.json({
          access_token: "x",
          id_token: googleIdToken(GOOGLE_CLAIMS),
        }),
    });
    const res = await callback(
      env,
      "google",
      txnFor("google"),
      { code: "g", state: "txn-1" },
      fetcher,
    );
    expect(res.status).toBe(302);
    const code = await openCode(
      env,
      new URL(res.headers.get("location")!).searchParams.get("code"),
      NOW,
    );
    expect(code?.identity).toEqual({
      sub: "google:1234567890",
      provider: "google",
      provider_id: "1234567890",
      email: "pat@gmail.com",
      email_verified: true,
      name: "Pat S",
      picture: "https://lh3.example/p",
    });
  });

  it("rejects an id_token for another audience or issuer", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    for (const claims of [
      { ...GOOGLE_CLAIMS, aud: "someone-else" },
      { ...GOOGLE_CLAIMS, iss: "https://evil.example" },
    ]) {
      const fetcher = providerFetch({
        "/token": () => Response.json({ id_token: googleIdToken(claims) }),
      });
      const res = await callback(
        env,
        "google",
        txnFor("google"),
        { code: "g", state: "txn-1" },
        fetcher,
      );
      expect(
        new URL(res.headers.get("location")!).searchParams.get("error"),
      ).toBe("server_error");
    }
    warn.mockRestore();
  });
});
