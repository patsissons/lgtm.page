import { findClient, isAllowedRedirect } from "./clients";
import { clearCookieHeader } from "./cookies";
import { signedOutPage } from "./html";
import { html, redirect } from "./http";
import { SESSION_COOKIE } from "./session";

/**
 * GET /logout (the `end_session_endpoint`). Clears the broker session so an
 * app's sign-out is not silently undone by the next /authorize. Redirects
 * only to a URI the named client could use for sign-in.
 */
export function handleLogout(url: URL): Response {
  const secure = url.protocol === "https:";
  const headers = { "set-cookie": clearCookieHeader(SESSION_COOKIE, secure) };
  const client = findClient(url.searchParams.get("client_id"));
  const target = url.searchParams.get("post_logout_redirect_uri");
  if (client && target && isAllowedRedirect(client, target)) {
    return redirect(target, headers);
  }
  return html(signedOutPage(), { headers });
}
