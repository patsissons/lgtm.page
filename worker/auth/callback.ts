import { authorizationResponse, withParams } from "./code";
import { clearCookieHeader, cookieHeader, parseCookies } from "./cookies";
import { nowSeconds } from "./crypto";
import type { AuthEnv } from "./env";
import { errorPage } from "./html";
import { html, redirect } from "./http";
import { exchangeCode } from "./providers";
import {
  SESSION_COOKIE,
  SESSION_TTL,
  TXN_COOKIE,
  openTxn,
  sealSession,
} from "./session";
import type { Mount, Provider } from "./types";

/**
 * GET /callback/<provider>. The sealed txn cookie must match `state` (login
 * CSRF); then the provider's code is exchanged server-side, the broker
 * session is set and the user goes back to the app with our own code.
 */
export async function handleCallback(
  request: Request,
  env: AuthEnv,
  url: URL,
  mount: Mount,
  provider: Provider,
  fetcher: typeof fetch = fetch,
): Promise<Response> {
  const now = nowSeconds();
  const secure = url.protocol === "https:";
  const clearTxn = clearCookieHeader(TXN_COOKIE, secure);
  const cookies = parseCookies(request.headers.get("cookie"));
  const txn = await openTxn(env, cookies[TXN_COOKIE], now);
  if (
    !txn ||
    txn.provider !== provider ||
    txn.id !== url.searchParams.get("state")
  ) {
    return html(
      errorPage(
        "Sign-in expired",
        "This sign-in took too long or was started in another browser. Go back to the app and try again.",
      ),
      { status: 400, headers: { "set-cookie": clearTxn } },
    );
  }

  const fail = (error: string, description: string) =>
    redirect(
      withParams(txn.redirect_uri, {
        error,
        error_description: description,
        state: txn.state,
        iss: mount.issuer,
      }),
      { "set-cookie": clearTxn },
    );

  const providerError = url.searchParams.get("error");
  if (providerError) {
    return fail("access_denied", `${provider}: ${providerError}`);
  }
  const code = url.searchParams.get("code");
  if (!code) return fail("invalid_request", `${provider} returned no code`);

  let identity;
  try {
    identity = await exchangeCode(
      env,
      provider,
      code,
      `${mount.issuer}/callback/${provider}`,
      fetcher,
    );
  } catch (error) {
    console.warn("lgtm auth: provider exchange failed", error);
    return fail("server_error", `${provider} sign-in could not be completed`);
  }

  const headers = new Headers();
  headers.append("set-cookie", clearTxn);
  headers.append(
    "set-cookie",
    cookieHeader(
      SESSION_COOKIE,
      await sealSession(env, {
        identity,
        auth_time: now,
        exp: now + SESSION_TTL,
      }),
      { maxAge: SESSION_TTL, secure },
    ),
  );
  return authorizationResponse(env, mount, txn, identity, now, headers, now);
}
