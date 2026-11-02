// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { issueTokens } from "./token";
import { handleUserinfo } from "./userinfo";
import { IDENTITY, PROD_MOUNT, makeEnv, type TestEnv } from "./test-env";

const NOW = 1_800_000_000;

let env: TestEnv;
beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW * 1000);
  env = await makeEnv();
});
afterEach(() => vi.useRealTimers());

async function tokens() {
  return issueTokens(
    env,
    PROD_MOUNT,
    {
      jti: "j",
      client_id: "wavelength",
      redirect_uri: "https://wavelength.lgtm.page/",
      scope: "openid",
      identity: IDENTITY,
      auth_time: NOW,
      exp: NOW + 60,
    },
    NOW,
  );
}

function get(authorization?: string, origin = "https://wavelength.lgtm.page") {
  return handleUserinfo(
    new Request("https://auth.lgtm.page/userinfo", {
      headers: { origin, ...(authorization ? { authorization } : {}) },
    }),
    env,
    PROD_MOUNT,
  );
}

describe("/userinfo", () => {
  it("returns the profile from an access token", async () => {
    const { access_token } = await tokens();
    const res = await get(`Bearer ${access_token}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("access-control-allow-origin")).toBe(
      "https://wavelength.lgtm.page",
    );
    expect(await res.json()).toEqual({
      sub: "github:42",
      email: "pat@example.com",
      email_verified: true,
      name: "Pat",
      picture: "https://avatars.example/42",
      preferred_username: "pat",
      provider: "github",
      provider_id: "42",
    });
  });

  it("rejects id tokens, expired tokens and no token", async () => {
    const { access_token, id_token } = await tokens();
    for (const header of [
      undefined,
      "Bearer nope",
      `Bearer ${id_token}`,
      `Basic ${access_token}`,
    ]) {
      const res = await get(header);
      expect(res.status, String(header)).toBe(401);
      expect(res.headers.get("www-authenticate")).toBe(
        'Bearer error="invalid_token"',
      );
    }
    vi.setSystemTime((NOW + 3601) * 1000);
    expect((await get(`Bearer ${access_token}`)).status).toBe(401);
  });
});
