// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deriveClientSecret } from "@shared/auth";
import { mintCode } from "./code";
import { verifyJwt } from "./jwt";
import { TOKEN_TTL, handleToken } from "./token";
import {
  IDENTITY,
  MASTER_SECRET,
  PROD_MOUNT,
  makeEnv,
  pkce,
  type TestEnv,
} from "./test-env";
import type { CodePayload } from "./types";

const NOW = 1_800_000_000;
const REDIRECT = "https://wavelength.lgtm.page/cb";

let env: TestEnv;
beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW * 1000);
  env = await makeEnv();
});
afterEach(() => vi.useRealTimers());

function post(
  form: Record<string, string>,
  headers: Record<string, string> = {},
) {
  return handleToken(
    new Request("https://auth.lgtm.page/token", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        ...headers,
      },
      body: new URLSearchParams(form).toString(),
    }),
    env,
    PROD_MOUNT,
  );
}

async function code(extra: Partial<Omit<CodePayload, "jti" | "exp">> = {}) {
  return mintCode(
    env,
    {
      client_id: "wavelength",
      redirect_uri: REDIRECT,
      scope: "openid email",
      identity: IDENTITY,
      auth_time: NOW - 10,
      ...extra,
    },
    NOW,
  );
}

async function body(res: Response) {
  return (await res.json()) as Record<string, unknown>;
}

describe("/token with PKCE (public client)", () => {
  it("issues an id_token and an at+jwt access token", async () => {
    const { verifier, challenge } = await pkce();
    const res = await post(
      {
        grant_type: "authorization_code",
        code: await code({ code_challenge: challenge, nonce: "nn" }),
        redirect_uri: REDIRECT,
        client_id: "wavelength",
        code_verifier: verifier,
      },
      { origin: "https://wavelength.lgtm.page" },
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("pragma")).toBe("no-cache");
    expect(res.headers.get("access-control-allow-origin")).toBe(
      "https://wavelength.lgtm.page",
    );
    const tokens = await body(res);
    expect(tokens).toMatchObject({
      token_type: "Bearer",
      expires_in: TOKEN_TTL,
      scope: "openid email",
    });

    const { loadSigningKeys } = await import("./jwt");
    const keys = await loadSigningKeys(env.AUTH_SIGNING_KEYS);
    const id = await verifyJwt(tokens.id_token as string, keys, {
      issuer: PROD_MOUNT.issuer,
      now: NOW,
    });
    expect(id?.header.typ).toBe("JWT");
    expect(id?.claims).toMatchObject({
      iss: PROD_MOUNT.issuer,
      sub: "github:42",
      aud: "wavelength",
      iat: NOW,
      exp: NOW + TOKEN_TTL,
      auth_time: NOW - 10,
      nonce: "nn",
      email: "pat@example.com",
      email_verified: true,
      name: "Pat",
      picture: "https://avatars.example/42",
      preferred_username: "pat",
      provider: "github",
      provider_id: "42",
    });
    const at = await verifyJwt(tokens.access_token as string, keys, {
      issuer: PROD_MOUNT.issuer,
      now: NOW,
    });
    expect(at?.header.typ).toBe("at+jwt");
    expect(at?.claims).toMatchObject({
      sub: "github:42",
      aud: "wavelength",
      client_id: "wavelength",
      scope: "openid email",
    });
    expect(at?.claims.jti).toBeTruthy();
    expect(at?.claims.nonce).toBeUndefined();
    expect(env.AUTH_KV.writes).toHaveLength(1);
  });

  it("rejects a wrong or missing verifier without burning the code", async () => {
    const { challenge } = await pkce();
    const c = await code({ code_challenge: challenge });
    const base = {
      grant_type: "authorization_code",
      code: c,
      redirect_uri: REDIRECT,
      client_id: "wavelength",
    };
    let res = await post(base);
    expect(res.status).toBe(400);
    expect((await body(res)).error).toBe("invalid_grant");
    res = await post({ ...base, code_verifier: "x".repeat(43) });
    expect((await body(res)).error).toBe("invalid_grant");
    res = await post({ ...base, code_verifier: "short" });
    expect((await body(res)).error).toBe("invalid_grant");
    expect(env.AUTH_KV.writes).toHaveLength(0);
  });

  it("rejects a replayed, expired, mismatched or foreign code", async () => {
    const { verifier, challenge } = await pkce();
    const c = await code({ code_challenge: challenge });
    const base = {
      grant_type: "authorization_code",
      code: c,
      redirect_uri: REDIRECT,
      client_id: "wavelength",
      code_verifier: verifier,
    };
    expect((await post(base)).status).toBe(200);
    let res = await post(base);
    expect((await body(res)).error_description).toBe("code already redeemed");

    const fresh = await code({ code_challenge: challenge });
    res = await post({
      ...base,
      code: fresh,
      redirect_uri: "https://wavelength.lgtm.page/other",
    });
    expect((await body(res)).error_description).toBe("redirect_uri mismatch");
    res = await post({ ...base, code: fresh, client_id: "voting" });
    expect((await body(res)).error).toBe("invalid_grant");
    res = await post({ ...base, code: fresh + "x" });
    expect((await body(res)).error).toBe("invalid_grant");

    vi.setSystemTime((NOW + 61) * 1000);
    res = await post({ ...base, code: fresh });
    expect((await body(res)).error).toBe("invalid_grant");
  });
});

describe("/token with a client secret (confidential client)", () => {
  it("accepts the derived secret via client_secret_post or Basic", async () => {
    const secret = await deriveClientSecret(MASTER_SECRET, "voting");
    const voting = {
      client_id: "voting",
      redirect_uri: "https://voting.lgtm.page/api/oauth2-redirect",
    };
    let res = await post({
      grant_type: "authorization_code",
      code: await code(voting),
      redirect_uri: voting.redirect_uri,
      client_id: "voting",
      client_secret: secret,
    });
    expect(res.status).toBe(200);

    res = await post(
      {
        grant_type: "authorization_code",
        code: await code(voting),
        redirect_uri: voting.redirect_uri,
      },
      { authorization: `Basic ${btoa(`voting:${secret}`)}` },
    );
    expect(res.status).toBe(200);
    expect((await body(res)).id_token).toBeTruthy();
  });

  it("requires a secret for a code minted without PKCE, and checks any secret presented", async () => {
    const voting = {
      client_id: "voting",
      redirect_uri: "https://voting.lgtm.page/cb",
    };
    let res = await post({
      grant_type: "authorization_code",
      code: await code(voting),
      redirect_uri: voting.redirect_uri,
      client_id: "voting",
    });
    expect(res.status).toBe(401);
    expect((await body(res)).error).toBe("invalid_client");

    res = await post(
      {
        grant_type: "authorization_code",
        code: await code(voting),
        redirect_uri: voting.redirect_uri,
      },
      { authorization: `Basic ${btoa("voting:wrong")}` },
    );
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toContain("Basic");

    const { verifier, challenge } = await pkce();
    res = await post({
      grant_type: "authorization_code",
      code: await code({ code_challenge: challenge }),
      redirect_uri: REDIRECT,
      client_id: "wavelength",
      code_verifier: verifier,
      client_secret: "wrong",
    });
    expect(res.status).toBe(401);
    expect(env.AUTH_KV.writes).toHaveLength(0);
  });
});

describe("/token request shape", () => {
  it("rejects non-form bodies, other grants and ambiguous client auth", async () => {
    let res = await handleToken(
      new Request("https://auth.lgtm.page/token", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      }),
      env,
      PROD_MOUNT,
    );
    expect((await body(res)).error).toBe("invalid_request");
    res = await post({ grant_type: "refresh_token", refresh_token: "x" });
    expect((await body(res)).error).toBe("unsupported_grant_type");
    res = await post({
      grant_type: "authorization_code",
      code: "x",
      redirect_uri: REDIRECT,
    });
    expect(res.status).toBe(401);
    res = await post(
      {
        grant_type: "authorization_code",
        code: "x",
        redirect_uri: REDIRECT,
        client_id: "wavelength",
      },
      { authorization: `Basic ${btoa("voting:s")}` },
    );
    expect((await body(res)).error_description).toBe("client_id mismatch");
  });

  it("does not reflect unknown origins", async () => {
    const res = await post(
      { grant_type: "x" },
      { origin: "https://evil.example" },
    );
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });
});
