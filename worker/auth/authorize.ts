import { findClient, isAllowedRedirect } from "./clients";
import { authorizationResponse, withParams } from "./code";
import { cookieHeader, parseCookies } from "./cookies";
import { nowSeconds, randomToken } from "./crypto";
import { SCOPES } from "./discovery";
import type { AuthEnv } from "./env";
import { chooserPage, errorPage } from "./html";
import { html, redirect } from "./http";
import { providerAuthorizeUrl } from "./providers";
import {
  SESSION_COOKIE,
  TXN_COOKIE,
  TXN_TTL,
  openSession,
  sealTxn,
} from "./session";
import type { AuthRequest, Mount, Prompt, Provider } from "./types";
import { PROVIDERS, isProvider } from "./types";

const MAX_OPAQUE = 512;
const CHALLENGE = /^[A-Za-z0-9_-]{43}$/;

function isPrompt(value: string): value is Prompt {
  return value === "none" || value === "login" || value === "select_account";
}

/**
 * GET /authorize. A bad client or redirect URI gets a page, never a redirect;
 * every later problem is reported to the app the OAuth way. With a usable
 * broker session the user is sent straight back with a code.
 */
export async function handleAuthorize(
  request: Request,
  env: AuthEnv,
  url: URL,
  mount: Mount,
): Promise<Response> {
  const params = url.searchParams;
  const now = nowSeconds();
  const secure = url.protocol === "https:";

  const client = findClient(params.get("client_id"));
  if (!client) {
    return html(
      errorPage(
        "Unknown app",
        "This sign-in request names an app that is not in the lgtm.page registry.",
      ),
      { status: 400 },
    );
  }
  const redirectUri = params.get("redirect_uri");
  if (!redirectUri || !isAllowedRedirect(client, redirectUri)) {
    return html(
      errorPage(
        "Bad redirect",
        `The sign-in request's redirect_uri is not on ${client.origin} (or a localhost address).`,
      ),
      { status: 400 },
    );
  }

  const state = params.get("state") ?? undefined;
  const fail = (error: string, description: string) =>
    redirect(
      withParams(redirectUri, {
        error,
        error_description: description,
        state:
          state !== undefined && state.length <= MAX_OPAQUE ? state : undefined,
        iss: mount.issuer,
      }),
    );

  if (state !== undefined && state.length > MAX_OPAQUE) {
    return fail(
      "invalid_request",
      `state is longer than ${MAX_OPAQUE} characters`,
    );
  }
  if (params.get("response_type") !== "code") {
    return fail("unsupported_response_type", "response_type must be code");
  }
  const nonce = params.get("nonce") ?? undefined;
  if (nonce !== undefined && nonce.length > MAX_OPAQUE) {
    return fail(
      "invalid_request",
      `nonce is longer than ${MAX_OPAQUE} characters`,
    );
  }
  const challenge = params.get("code_challenge") ?? undefined;
  const method = params.get("code_challenge_method");
  if (challenge !== undefined) {
    if (method !== "S256") {
      return fail("invalid_request", "code_challenge_method must be S256");
    }
    if (!CHALLENGE.test(challenge)) {
      return fail(
        "invalid_request",
        "code_challenge must be base64url(SHA-256)",
      );
    }
  } else if (method !== null) {
    return fail(
      "invalid_request",
      "code_challenge_method without code_challenge",
    );
  }
  const promptParam = params.get("prompt");
  if (promptParam !== null && !isPrompt(promptParam)) {
    return fail(
      "invalid_request",
      "prompt must be none, login or select_account",
    );
  }
  const prompt = promptParam ?? undefined;
  const providerParam = params.get("provider");
  if (providerParam !== null && !isProvider(providerParam)) {
    return fail("invalid_request", "provider must be github or google");
  }
  const provider = providerParam ?? undefined;
  const requested = (params.get("scope") ?? "").split(/\s+/).filter(Boolean);
  const granted = SCOPES.filter((scope) => requested.includes(scope));
  const scope = granted.length ? granted.join(" ") : "openid";

  const grant = {
    client_id: client.id,
    redirect_uri: redirectUri,
    state,
    nonce,
    scope,
    code_challenge: challenge,
  };

  const cookies = parseCookies(request.headers.get("cookie"));
  const session = await openSession(env, cookies[SESSION_COOKIE], now);
  const reauth = prompt === "login" || prompt === "select_account";
  if (
    session &&
    !reauth &&
    (provider === undefined || provider === session.identity.provider)
  ) {
    return authorizationResponse(
      env,
      mount,
      grant,
      session.identity,
      session.auth_time,
      {},
      now,
    );
  }
  if (prompt === "none") {
    return fail(
      "login_required",
      "no lgtm.page session; sign in interactively",
    );
  }

  if (provider === undefined) {
    const links = Object.fromEntries(
      PROVIDERS.map((p) => {
        const link = new URL(`${mount.issuer}/authorize`);
        link.search = params.toString();
        link.searchParams.set("provider", p);
        return [p, link.href];
      }),
    ) as Record<Provider, string>;
    return html(chooserPage(client.id, links));
  }

  const txn: AuthRequest = {
    id: randomToken(),
    ...grant,
    provider,
    exp: now + TXN_TTL,
  };
  return redirect(
    providerAuthorizeUrl(env, provider, {
      redirectUri: `${mount.issuer}/callback/${provider}`,
      state: txn.id,
      selectAccount: reauth,
    }),
    {
      "set-cookie": cookieHeader(TXN_COOKIE, await sealTxn(env, txn), {
        maxAge: TXN_TTL,
        secure,
      }),
    },
  );
}
