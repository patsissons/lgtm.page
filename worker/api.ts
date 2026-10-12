export function json(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { "content-type": "application/json", ...init.headers },
  });
}

export async function handleApi(
  _request: Request,
  _ctx: ExecutionContext,
  url: URL,
): Promise<Response> {
  if (url.pathname === "/api/health") return json({ ok: true });
  return json({ error: "not_found" }, { status: 404 });
}
