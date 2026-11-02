// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { utf8ToBase64Url } from "@shared/auth";
import { handleAuth } from "./index";
import { verifyJwt } from "./jwt";
import { SESSION_COOKIE } from "./session";
import {
  cookieHeaderFrom,
  makeEnv,
  pkce,
  setCookies,
  type TestEnv,
} from "./test-env";

const NOW = 1_800_000_000;
const ISSUER = "https://auth.lgtm.page";
const MOUNT = { issuer: ISSUER, prefix: "" };
const REDIRECT = "https://wavelength.lgtm.page/auth/callback";

/** GitHub and Google at the same stub origin, as AUTH_PROVIDER_ORIGIN does it. */
function stubProviders() {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url,
    );
    switch (url.pathname) {
      case "/login/oauth/access_token":
        return Response.json({ access_token: "gh" });
      case "/user":
        return Response.json({ id: 7, login: "pat", name: "Pat" });
      case "/user/emails":
        return Response.json([
          { email: "pat@example.com", primary: true, verified: true },
        ]);
      case "/token":
        return Response.json({
          id_token: `${utf8ToBase64Url("{}")}.${utf8ToBase64Url(
            JSON.stringify({
              iss: "accounts.google.com",
              aud: "google-client",
              sub: "g1",
              email: "pat@gmail.com",
              email_verified: true,
            }),
          )}.x`,
        });
      default:
        return new Response("nope", { status: 404 });
    }
  });
}

let env: TestEnv;
beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW * 1000);
  env = await makeEnv({ AUTH_PROVIDER_ORIGIN: "http://stub.test" as never });
  vi.stubGlobal("fetch", stubProviders());
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** A browser: follows the broker's redirects and keeps its cookies. */
function browser() {
  const jar: Record<string, string> = {};
  return {
    jar,
    async get(url: string) {
      const parsed = new URL(url);
      const res = await handleAuth(
        new Request(parsed, { headers: { cookie: cookieHeaderFrom(jar) } }),
        env,
        parsed,
        MOUNT,
      );
      Object.assign(jar, setCookies(res));
      for (const name of Object.keys(jar))
        if (jar[name] === "") delete jar[name];
      return res;
    },
  };
}

async function discovery() {
  const url = new URL(`${ISSUER}/.well-known/openid-configuration`);
  return (await (
    await handleAuth(new Request(url), env, url, MOUNT)
  ).json()) as Record<string, string>;
}

describe("the whole flow", () => {
  it("authorize -> chooser -> provider -> callback -> token -> userinfo, then silent, then logout", async () => {
    const doc = await discovery();
    const { verifier, challenge } = await pkce();
    const pat = browser();

    // 1. The app sends the user to /authorize.
    const authorize = new URL(doc.authorization_endpoint);
    for (const [k, v] of Object.entries({
      client_id: "wavelength",
      redirect_uri: REDIRECT,
      response_type: "code",
      scope: "openid email profile",
      state: "app-state",
      nonce: "app-nonce",
      code_challenge: challenge,
      code_challenge_method: "S256",
    })) {
      authorize.searchParams.set(k, v);
    }
    let res = await pat.get(authorize.href);
    expect(res.status).toBe(200);
    const chooser = await res.text();
    const githubLink = chooser
      .match(/href="([^"]+provider=github[^"]*)"/)![1]
      .replace(/&amp;/g, "&");

    // 2. Choosing GitHub redirects to the (stubbed) provider with a txn cookie.
    res = await pat.get(githubLink);
    expect(res.status).toBe(302);
    const atProvider = new URL(res.headers.get("location")!);
    expect(atProvider.origin).toBe("http://stub.test");
    expect(atProvider.pathname).toBe("/login/oauth/authorize");

    // 3. The provider sends the user back to our callback with its code + our state.
    const callback = new URL(atProvider.searchParams.get("redirect_uri")!);
    callback.searchParams.set("code", "provider-code");
    callback.searchParams.set("state", atProvider.searchParams.get("state")!);
    res = await pat.get(callback.href);
    expect(res.status).toBe(302);
    const backAtApp = new URL(res.headers.get("location")!);
    expect(backAtApp.origin + backAtApp.pathname).toBe(REDIRECT);
    expect(backAtApp.searchParams.get("state")).toBe("app-state");
    expect(backAtApp.searchParams.get("iss")).toBe(ISSUER);
    expect(pat.jar[SESSION_COOKIE]).toBeTruthy();

    // 4. The app redeems the code (no cookies involved).
    const tokenUrl = new URL(doc.token_endpoint);
    res = await handleAuth(
      new Request(tokenUrl, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          origin: "https://wavelength.lgtm.page",
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code: backAtApp.searchParams.get("code")!,
          redirect_uri: REDIRECT,
          client_id: "wavelength",
          code_verifier: verifier,
        }),
      }),
      env,
      tokenUrl,
      MOUNT,
    );
    expect(res.status).toBe(200);
    const tokens = (await res.json()) as Record<string, string>;

    // 5. The app verifies the id_token against the published JWKS.
    const jwksUrl = new URL(doc.jwks_uri);
    const jwks = (await (
      await handleAuth(new Request(jwksUrl), env, jwksUrl, MOUNT)
    ).json()) as {
      keys: (JsonWebKey & { kid: string })[];
    };
    const [header, payload, signature] = tokens.id_token.split(".");
    const kid = (JSON.parse(atob(header)) as { kid: string }).kid;
    const jwk = jwks.keys.find((k) => k.kid === kid)!;
    const key = await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"],
    );
    const sig = Uint8Array.from(
      atob(signature.replace(/-/g, "+").replace(/_/g, "/")),
      (c) => c.charCodeAt(0),
    );
    expect(
      await crypto.subtle.verify(
        { name: "ECDSA", hash: "SHA-256" },
        key,
        sig,
        new TextEncoder().encode(`${header}.${payload}`),
      ),
    ).toBe(true);
    const claims = JSON.parse(
      atob(payload.replace(/-/g, "+").replace(/_/g, "/")),
    ) as Record<string, unknown>;
    expect(claims).toMatchObject({
      iss: ISSUER,
      aud: "wavelength",
      sub: "github:7",
      nonce: "app-nonce",
      email: "pat@example.com",
      preferred_username: "pat",
      auth_time: NOW,
    });

    // 6. /userinfo with the access token.
    const userinfoUrl = new URL(doc.userinfo_endpoint);
    res = await handleAuth(
      new Request(userinfoUrl, {
        headers: { authorization: `Bearer ${tokens.access_token}` },
      }),
      env,
      userinfoUrl,
      MOUNT,
    );
    expect(((await res.json()) as { sub: string }).sub).toBe("github:7");
    expect(env.AUTH_KV.writes).toHaveLength(1);

    // 7. A second app's sign-in is silent thanks to the broker session.
    const again = new URL(authorize.href);
    again.searchParams.set("client_id", "prismy");
    again.searchParams.set("redirect_uri", "https://prismy.lgtm.page/cb");
    res = await pat.get(again.href);
    expect(res.status).toBe(302);
    expect(new URL(res.headers.get("location")!).searchParams.has("code")).toBe(
      true,
    );
    const keys = await (
      await import("./jwt")
    ).loadSigningKeys(env.AUTH_SIGNING_KEYS);
    expect(
      (await verifyJwt(tokens.id_token, keys, { issuer: ISSUER, now: NOW }))
        ?.claims.aud,
    ).toBe("wavelength");

    // 8. Logout, then the chooser is back.
    res = await pat.get(
      `${doc.end_session_endpoint}?client_id=wavelength&post_logout_redirect_uri=${encodeURIComponent("https://wavelength.lgtm.page/")}`,
    );
    expect(res.status).toBe(302);
    expect(pat.jar[SESSION_COOKIE]).toBeUndefined();
    res = await pat.get(authorize.href);
    expect(res.status).toBe(200);
  });

  it("works for Google too and keeps provider accounts apart", async () => {
    const doc = await discovery();
    const pat = browser();
    const { challenge } = await pkce();
    const authorize = new URL(doc.authorization_endpoint);
    for (const [k, v] of Object.entries({
      client_id: "wavelength",
      redirect_uri: REDIRECT,
      response_type: "code",
      provider: "google",
      code_challenge: challenge,
      code_challenge_method: "S256",
    })) {
      authorize.searchParams.set(k, v);
    }
    let res = await pat.get(authorize.href);
    const atProvider = new URL(res.headers.get("location")!);
    expect(atProvider.pathname).toBe("/o/oauth2/v2/auth");
    const callback = new URL(atProvider.searchParams.get("redirect_uri")!);
    callback.searchParams.set("code", "g");
    callback.searchParams.set("state", atProvider.searchParams.get("state")!);
    res = await pat.get(callback.href);
    expect(res.status).toBe(302);
    // A GitHub-only request now has to go to GitHub despite the Google session.
    authorize.searchParams.set("provider", "github");
    res = await pat.get(authorize.href);
    expect(new URL(res.headers.get("location")!).pathname).toBe(
      "/login/oauth/authorize",
    );
  });
});
