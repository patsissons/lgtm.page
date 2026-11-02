// @vitest-environment node
import { describe, expect, it } from "vitest";
import { openSession, openTxn, sealSession, sealTxn } from "./session";
import { IDENTITY, makeEnv } from "./test-env";
import type { AuthRequest } from "./types";

const NOW = 1_800_000_000;

const TXN: AuthRequest = {
  id: "txn-id",
  client_id: "wavelength",
  redirect_uri: "https://wavelength.lgtm.page/cb",
  state: "s",
  scope: "openid",
  provider: "github",
  exp: NOW + 600,
};

describe("txn and session cookies", () => {
  it("round-trip and expire", async () => {
    const env = await makeEnv();
    const txn = await sealTxn(env, TXN);
    expect(await openTxn(env, txn, NOW)).toEqual(TXN);
    expect(await openTxn(env, txn, NOW + 600)).toBeNull();
    expect(await openTxn(env, undefined, NOW)).toBeNull();

    const session = await sealSession(env, {
      identity: IDENTITY,
      auth_time: NOW,
      exp: NOW + 100,
    });
    expect((await openSession(env, session, NOW))?.identity).toEqual(IDENTITY);
    expect(await openSession(env, session, NOW + 100)).toBeNull();
  });

  it("never opens one kind as the other", async () => {
    const env = await makeEnv();
    const txn = await sealTxn(env, TXN);
    expect(await openSession(env, txn, NOW)).toBeNull();
    const session = await sealSession(env, {
      identity: IDENTITY,
      auth_time: NOW,
      exp: NOW + 100,
    });
    expect(await openTxn(env, session, NOW)).toBeNull();
  });

  it("rejects a payload with the wrong shape", async () => {
    const env = await makeEnv();
    const bad = await sealTxn(env, {
      ...TXN,
      provider: "x",
    } as unknown as AuthRequest);
    expect(await openTxn(env, bad, NOW)).toBeNull();
  });
});
