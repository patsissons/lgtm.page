import { handleApi } from "./api";
import { authMount, handleAuth } from "./auth";
import type { AuthEnv } from "./auth/env";

/** www.lgtm.page (or www. on any host) permanently redirects to the apex. */
export function wwwRedirect(url: URL): Response | null {
  if (!url.hostname.startsWith("www.")) return null;
  const target = new URL(url);
  target.hostname = url.hostname.slice(4);
  return Response.redirect(target.href, 301);
}

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const url = new URL(request.url);
    const redirect = wwwRedirect(url);
    if (redirect) return redirect;
    const mount = authMount(url, env);
    if (mount) return handleAuth(request, env as AuthEnv, url, mount);
    if (url.pathname.startsWith("/api/")) {
      return handleApi(request, ctx, url);
    }
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
