// @vitest-environment node
import { describe, expect, it } from "vitest";
import { discoveryDocument, handleDiscovery, handleJwks } from "./discovery";
import { DEV_MOUNT, PROD_MOUNT, makeEnv } from "./test-env";

describe("discovery", () => {
  it("derives every URL from the mount's issuer", () => {
    const prod = discoveryDocument(PROD_MOUNT);
    expect(prod.issuer).toBe("https://auth.lgtm.page");
    expect(prod.authorization_endpoint).toBe(
      "https://auth.lgtm.page/authorize",
    );
    expect(prod.jwks_uri).toBe("https://auth.lgtm.page/.well-known/jwks.json");
    expect(prod.end_session_endpoint).toBe("https://auth.lgtm.page/logout");
    const dev = discoveryDocument(DEV_MOUNT);
    expect(dev.issuer).toBe("http://localhost:5173/auth");
    expect(dev.token_endpoint).toBe("http://localhost:5173/auth/token");
    expect(dev.userinfo_endpoint).toBe("http://localhost:5173/auth/userinfo");
  });

  it("advertises code + PKCE S256 + ES256 only", () => {
    const doc = discoveryDocument(PROD_MOUNT);
    expect(doc.response_types_supported).toEqual(["code"]);
    expect(doc.grant_types_supported).toEqual(["authorization_code"]);
    expect(doc.code_challenge_methods_supported).toEqual(["S256"]);
    expect(doc.id_token_signing_alg_values_supported).toEqual(["ES256"]);
    expect(doc.token_endpoint_auth_methods_supported).toContain("none");
    expect(doc.authorization_response_iss_parameter_supported).toBe(true);
  });

  it("is cacheable and open to every origin", async () => {
    const env = await makeEnv();
    const req = new Request(
      "https://auth.lgtm.page/.well-known/openid-configuration",
      {
        headers: { origin: "https://anything.example" },
      },
    );
    const res = handleDiscovery(req, PROD_MOUNT);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("cache-control")).toBe("public, max-age=3600");
    const jwks = await handleJwks(req, env);
    expect(jwks.headers.get("access-control-allow-origin")).toBe("*");
    expect(jwks.headers.get("cache-control")).toBe("public, max-age=600");
    const body = (await jwks.json()) as { keys: Record<string, unknown>[] };
    expect(body.keys).toHaveLength(1);
    expect(body.keys[0]).not.toHaveProperty("d");
    expect(body.keys[0].alg).toBe("ES256");
  });
});
