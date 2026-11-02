import { json } from "../api";
import { corsHeaders } from "./cors";
import { loadSigningKeys, publicJwks } from "./jwt";
import type { AuthEnv } from "./env";
import type { Mount } from "./types";

export const SCOPES = ["openid", "email", "profile"] as const;

export const CLAIMS = [
  "sub",
  "iss",
  "aud",
  "exp",
  "iat",
  "auth_time",
  "nonce",
  "email",
  "email_verified",
  "name",
  "picture",
  "preferred_username",
  "provider",
  "provider_id",
] as const;

export function discoveryDocument(mount: Mount) {
  const { issuer } = mount;
  return {
    issuer,
    authorization_endpoint: `${issuer}/authorize`,
    token_endpoint: `${issuer}/token`,
    userinfo_endpoint: `${issuer}/userinfo`,
    jwks_uri: `${issuer}/.well-known/jwks.json`,
    end_session_endpoint: `${issuer}/logout`,
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code"],
    subject_types_supported: ["public"],
    id_token_signing_alg_values_supported: ["ES256"],
    scopes_supported: [...SCOPES],
    token_endpoint_auth_methods_supported: [
      "none",
      "client_secret_basic",
      "client_secret_post",
    ],
    code_challenge_methods_supported: ["S256"],
    claims_supported: [...CLAIMS],
    authorization_response_iss_parameter_supported: true,
  };
}

export function handleDiscovery(request: Request, mount: Mount): Response {
  return json(discoveryDocument(mount), {
    headers: {
      "cache-control": "public, max-age=3600",
      ...corsHeaders(request, "public"),
    },
  });
}

export async function handleJwks(
  request: Request,
  env: AuthEnv,
): Promise<Response> {
  const keys = await loadSigningKeys(env.AUTH_SIGNING_KEYS);
  return json(publicJwks(keys), {
    headers: {
      "cache-control": "public, max-age=600",
      ...corsHeaders(request, "public"),
    },
  });
}
