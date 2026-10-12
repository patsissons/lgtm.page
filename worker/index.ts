import { handleApi } from "./api";

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      return handleApi(request, ctx, url);
    }
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
