// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CODE_BURN_TTL,
  CODE_TTL,
  authorizationResponse,
  burnCode,
  mintCode,
  openCode,
  withParams,
} from "./code";
import { IDENTITY, PROD_MOUNT, makeEnv } from "./test-env";

const NOW = 1_800_000_000;

const GRANT = {
  client_id: "wavelength",
  redirect_uri: "https://wavelength.lgtm.page/cb",
  state: "s",
  nonce: "n",
  scope: "openid email",
  code_challenge: "c".repeat(43),
};

afterEach(() => vi.useRealTimers());

describe("codes", () => {
  it("mint/open round-trips and binds everything", async () => {
    const env = await makeEnv();
    const code = await mintCode(
      env,
      { ...GRANT, identity: IDENTITY, auth_time: NOW - 5 },
      NOW,
    );
    const payload = await openCode(env, code, NOW + 1);
    expect(payload).toMatchObject({
      ...GRANT,
      identity: IDENTITY,
      auth_time: NOW - 5,
      exp: NOW + CODE_TTL,
    });
    expect(payload?.jti).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });

  it("expires, and rejects foreign or garbage codes", async () => {
    const env = await makeEnv();
    const code = await mintCode(
      env,
      { ...GRANT, identity: IDENTITY, auth_time: NOW },
      NOW,
    );
    expect(await openCode(env, code, NOW + CODE_TTL)).toBeNull();
    expect(await openCode(env, code + "x", NOW)).toBeNull();
    expect(await openCode(env, null, NOW)).toBeNull();
    const other = await makeEnv({ AUTH_MASTER_SECRET: "other" });
    expect(await openCode(other, code, NOW)).toBeNull();
  });

  it("burns once, with one KV write and a TTL above KV's minimum", async () => {
    const env = await makeEnv();
    expect(await burnCode(env.AUTH_KV, "abc")).toBe(true);
    expect(await burnCode(env.AUTH_KV, "abc")).toBe(false);
    expect(await burnCode(env.AUTH_KV, "def")).toBe(true);
    expect(env.AUTH_KV.writes).toEqual([
      { key: "code:abc", expirationTtl: CODE_BURN_TTL },
      { key: "code:def", expirationTtl: CODE_BURN_TTL },
    ]);
    expect(CODE_BURN_TTL).toBeGreaterThanOrEqual(60);
  });
});

describe("withParams / authorizationResponse", () => {
  it("appends to an existing query and skips undefined", () => {
    expect(
      withParams("https://a.lgtm.page/cb?x=1", { code: "c", state: undefined }),
    ).toBe("https://a.lgtm.page/cb?x=1&code=c");
  });

  it("redirects back with code, state and iss and nothing stored", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW * 1000);
    const env = await makeEnv();
    const res = await authorizationResponse(
      env,
      PROD_MOUNT,
      GRANT,
      IDENTITY,
      NOW,
      {
        "set-cookie": "a=b",
      },
    );
    expect(res.status).toBe(302);
    const location = new URL(res.headers.get("location")!);
    expect(location.origin + location.pathname).toBe(GRANT.redirect_uri);
    expect(location.searchParams.get("state")).toBe("s");
    expect(location.searchParams.get("iss")).toBe(PROD_MOUNT.issuer);
    expect(res.headers.get("set-cookie")).toBe("a=b");
    expect(res.headers.get("cache-control")).toBe("no-store");
    const payload = await openCode(env, location.searchParams.get("code"), NOW);
    expect(payload?.identity).toEqual(IDENTITY);
    expect(payload?.nonce).toBe("n");
    expect(env.AUTH_KV.writes).toEqual([]);
  });
});
