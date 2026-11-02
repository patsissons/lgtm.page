import { authMount, handleAuth, isDevHost } from "./auth";
import { INDEX_CLIENT } from "./auth/clients";
import { clearCookieHeader, cookieHeader, parseCookies } from "./auth/cookies";
import {
  nowSeconds,
  open,
  randomToken,
  seal,
  sha256Base64Url,
} from "./auth/crypto";
import type { AuthEnv } from "./auth/env";
import { errorPage } from "./auth/html";
import { NO_STORE, html, jsonNoStore, redirect } from "./auth/http";
import { loadSigningKeys, verifyJwt } from "./auth/jwt";
import type { Provider } from "./auth/types";
import { isProvider } from "./auth/types";

/**
 * Sign-in for the index itself. lgtm.page is an ordinary client of the
 * broker (the built-in `lgtm` client): /api/auth/login starts a code + PKCE
 * flow, /api/auth/callback redeems the code in-process and keeps the account
 * in a sealed cookie of its own, separate from the broker's session.
 */

export const LOGIN_COOKIE = "lgtm_login";
export const SESSION_COOKIE = "lgtm_session";
/** How long the user may spend at the broker and the provider. */
export const LOGIN_TTL = 10 * 60;
/** How long the index remembers the account; not sliding. */
export const SESSION_TTL = 30 * 24 * 3600;
export const CLIENT_ID = INDEX_CLIENT.id;

/** The pending sign-in, sealed in `lgtm_login` while the user is away. */
interface LoginPayload {
  state: string;
  verifier: string;
  nonce: string;
  exp: number;
}

/** Who is signed in to the index, sealed in `lgtm_session`. */
export interface AccountSession {
  sub: string;
  provider: Provider;
  name?: string;
  email?: string;
  picture?: string;
  preferred_username?: string;
  exp: number;
}

/** What /api/auth/me returns. */
export interface AccountUser {
  sub: string;
  provider: Provider;
  name?: string;
  email?: string;
  picture?: string;
  preferredUsername?: string;
}

/**
 * Where the broker is for this request: path-mounted on the same origin in
 * dev and previews, the auth host everywhere else.
 */
export function issuerFor(url: URL, env: Pick<AuthEnv, "AUTH_HOST">): string {
  return isDevHost(url.hostname)
    ? `${url.origin}/auth`
    : `https://${env.AUTH_HOST}`;
}

export async function handleAccount(
  request: Request,
  env: AuthEnv,
  url: URL,
): Promise<Response> {
  const path = url.pathname.slice("/api/auth".length);
  const { method } = request;
  if (path === "/login") {
    if (method === "GET") return handleLogin(env, url);
  } else if (path === "/callback") {
    if (method === "GET") return handleCallback(request, env, url);
  } else if (path === "/me") {
    if (method === "GET") return handleMe(request, env);
  } else if (path === "/logout") {
    if (method === "POST") return handleLogout(env, url);
  } else {
    return jsonNoStore({ error: "not_found" }, { status: 404 });
  }
  return jsonNoStore({ error: "method_not_allowed" }, { status: 405 });
}

function callbackUrl(url: URL): string {
  return `${url.origin}/api/auth/callback`;
}

/** GET /api/auth/login?provider=github|google -> the broker's /authorize. */
async function handleLogin(env: AuthEnv, url: URL): Promise<Response> {
  const provider = url.searchParams.get("provider");
  if (provider !== null && !isProvider(provider)) {
    return jsonNoStore(
      { error: "invalid_request", error_description: "unknown provider" },
      { status: 400 },
    );
  }
  const now = nowSeconds();
  const login: LoginPayload = {
    state: randomToken(),
    verifier: randomToken(32),
    nonce: randomToken(),
    exp: now + LOGIN_TTL,
  };
  const target = new URL(`${issuerFor(url, env)}/authorize`);
  target.searchParams.set("client_id", CLIENT_ID);
  target.searchParams.set("redirect_uri", callbackUrl(url));
  target.searchParams.set("response_type", "code");
  target.searchParams.set("scope", "openid email profile");
  target.searchParams.set("state", login.state);
  target.searchParams.set("nonce", login.nonce);
  target.searchParams.set(
    "code_challenge",
    await sha256Base64Url(login.verifier),
  );
  target.searchParams.set("code_challenge_method", "S256");
  if (provider) target.searchParams.set("provider", provider);
  return redirect(target.href, {
    "set-cookie": cookieHeader(
      LOGIN_COOKIE,
      await seal(env.AUTH_MASTER_SECRET, "login", login),
      { maxAge: LOGIN_TTL, secure: url.protocol === "https:" },
    ),
  });
}

async function openLogin(
  env: AuthEnv,
  sealed: string | undefined,
  now: number,
): Promise<LoginPayload | null> {
  const value = (await open(
    env.AUTH_MASTER_SECRET,
    "login",
    sealed,
  )) as Partial<LoginPayload> | null;
  if (
    !value ||
    typeof value.state !== "string" ||
    typeof value.verifier !== "string" ||
    typeof value.nonce !== "string" ||
    typeof value.exp !== "number" ||
    value.exp <= now
  ) {
    return null;
  }
  return value as LoginPayload;
}

/**
 * GET /api/auth/callback?code&state. The code is redeemed by calling the
 * broker's /token handler directly (same Worker, no HTTP hop), the id_token
 * is verified against the broker's keys, and the account goes into a cookie.
 */
async function handleCallback(
  request: Request,
  env: AuthEnv,
  url: URL,
): Promise<Response> {
  const now = nowSeconds();
  const secure = url.protocol === "https:";
  const clearLogin = clearCookieHeader(LOGIN_COOKIE, secure);
  const cookies = parseCookies(request.headers.get("cookie"));
  const login = await openLogin(env, cookies[LOGIN_COOKIE], now);
  if (!login || login.state !== url.searchParams.get("state")) {
    return html(
      errorPage(
        "Sign-in expired",
        "This sign-in took too long or was started in another browser. Go back to lgtm.page and try again.",
      ),
      { status: 400, headers: { "set-cookie": clearLogin } },
    );
  }
  const error = url.searchParams.get("error");
  if (error) {
    return redirect(`/?auth_error=${encodeURIComponent(error)}`, {
      "set-cookie": clearLogin,
    });
  }
  const code = url.searchParams.get("code");
  if (!code) {
    return redirect("/?auth_error=invalid_request", {
      "set-cookie": clearLogin,
    });
  }

  const issuer = issuerFor(url, env);
  const tokenUrl = new URL(`${issuer}/token`);
  const mount = authMount(tokenUrl, env);
  if (!mount) {
    return redirect("/?auth_error=server_error", {
      "set-cookie": clearLogin,
    });
  }
  const tokenRes = await handleAuth(
    new Request(tokenUrl, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: callbackUrl(url),
        client_id: CLIENT_ID,
        code_verifier: login.verifier,
      }),
    }),
    env,
    tokenUrl,
    mount,
  );
  if (!tokenRes.ok) {
    const body = (await tokenRes.json().catch(() => ({}))) as {
      error?: string;
    };
    console.warn("lgtm account: token exchange failed", body);
    return redirect(
      `/?auth_error=${encodeURIComponent(body.error ?? "server_error")}`,
      { "set-cookie": clearLogin },
    );
  }
  const { id_token } = (await tokenRes.json()) as { id_token?: string };
  const verified = id_token
    ? await verifyJwt(id_token, await loadSigningKeys(env.AUTH_SIGNING_KEYS), {
        issuer,
        now,
      })
    : null;
  const claims = verified?.claims;
  if (
    !claims ||
    verified.header.typ !== "JWT" ||
    claims.aud !== CLIENT_ID ||
    claims.nonce !== login.nonce ||
    !isProvider(claims.provider)
  ) {
    console.warn("lgtm account: id_token rejected");
    return redirect("/?auth_error=invalid_token", {
      "set-cookie": clearLogin,
    });
  }

  const session: AccountSession = {
    sub: claims.sub,
    provider: claims.provider,
    exp: now + SESSION_TTL,
  };
  if (typeof claims.name === "string") session.name = claims.name;
  if (typeof claims.email === "string") session.email = claims.email;
  if (typeof claims.picture === "string") session.picture = claims.picture;
  if (typeof claims.preferred_username === "string") {
    session.preferred_username = claims.preferred_username;
  }
  const headers = new Headers();
  headers.append("set-cookie", clearLogin);
  headers.append(
    "set-cookie",
    cookieHeader(
      SESSION_COOKIE,
      await seal(env.AUTH_MASTER_SECRET, "account", session),
      { maxAge: SESSION_TTL, secure },
    ),
  );
  return redirect("/", headers);
}

export async function openAccount(
  env: Pick<AuthEnv, "AUTH_MASTER_SECRET">,
  sealed: string | undefined,
  now = nowSeconds(),
): Promise<AccountSession | null> {
  const value = (await open(
    env.AUTH_MASTER_SECRET,
    "account",
    sealed,
  )) as Partial<AccountSession> | null;
  if (
    !value ||
    typeof value.sub !== "string" ||
    !isProvider(value.provider) ||
    typeof value.exp !== "number" ||
    value.exp <= now
  ) {
    return null;
  }
  return value as AccountSession;
}

/** GET /api/auth/me -> `{ user }` or `{ user: null }`. */
async function handleMe(request: Request, env: AuthEnv): Promise<Response> {
  const cookies = parseCookies(request.headers.get("cookie"));
  const session = await openAccount(env, cookies[SESSION_COOKIE]);
  const user: AccountUser | null = session
    ? {
        sub: session.sub,
        provider: session.provider,
        ...(session.name !== undefined ? { name: session.name } : {}),
        ...(session.email !== undefined ? { email: session.email } : {}),
        ...(session.picture !== undefined ? { picture: session.picture } : {}),
        ...(session.preferred_username !== undefined
          ? { preferredUsername: session.preferred_username }
          : {}),
      }
    : null;
  return jsonNoStore({ user });
}

/**
 * POST /api/auth/logout. Clears the index's cookie and then ends the broker
 * session too, otherwise the next sign-in anywhere would be silent.
 */
function handleLogout(env: AuthEnv, url: URL): Response {
  const target = new URL(`${issuerFor(url, env)}/logout`);
  target.searchParams.set("client_id", CLIENT_ID);
  target.searchParams.set("post_logout_redirect_uri", `${url.origin}/`);
  return new Response(null, {
    status: 303,
    headers: {
      location: target.href,
      "set-cookie": clearCookieHeader(
        SESSION_COOKIE,
        url.protocol === "https:",
      ),
      ...NO_STORE,
    },
  });
}
