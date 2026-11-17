import { afterEach, describe, expect, it, vi } from "vitest";
import worker, { wwwRedirect } from "./index";

vi.mock("@shared/apps", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@shared/apps")>();
  return {
    ...actual,
    sites: new Map([
      ["tiny", { slug: "tiny", site: "https://example.com/tiny" }],
    ]),
  };
});

describe("wwwRedirect", () => {
  it("sends www to the apex, keeping the path and query", () => {
    const res = wwwRedirect(new URL("https://www.lgtm.page/a/b?c=1#d"));
    expect(res?.status).toBe(301);
    expect(res?.headers.get("location")).toBe("https://lgtm.page/a/b?c=1#d");
  });

  it("leaves the apex alone", () => {
    expect(wwwRedirect(new URL("https://lgtm.page/"))).toBeNull();
    expect(wwwRedirect(new URL("http://localhost:5173/"))).toBeNull();
  });
});

describe("fetch", () => {
  afterEach(() => vi.unstubAllGlobals());

  const assets = vi.fn(async () => new Response("asset"));
  const env = { ASSETS: { fetch: assets } } as unknown as Env;
  const ctx = {} as ExecutionContext;
  const call = (href: string) =>
    worker.fetch(new Request(href), env, ctx) as Promise<Response>;

  it("proxies a site on its subdomain and under the index", async () => {
    const upstream = vi.fn(
      async (_input: RequestInfo | URL) => new Response("<h1>Tiny</h1>"),
    );
    vi.stubGlobal("fetch", upstream);
    for (const href of [
      "https://tiny.lgtm.page/",
      "https://tiny.lgtm.page/api/apps",
      "https://lgtm.page/tiny/",
    ]) {
      const res = await call(href);
      expect(await res.text()).toBe("<h1>Tiny</h1>");
    }
    expect(upstream.mock.calls.map(([input]) => String(input))).toEqual([
      "https://example.com/tiny/index.html",
      "https://example.com/tiny/api/apps",
      "https://example.com/tiny/index.html",
    ]);
    expect(assets).not.toHaveBeenCalled();
  });

  it("leaves other paths to the API and the assets", async () => {
    const health = await call("https://lgtm.page/api/health");
    expect(await health.json()).toEqual({ ok: true });
    expect(await (await call("https://lgtm.page/tinyx/")).text()).toBe("asset");
    expect(assets).toHaveBeenCalledTimes(1);
  });
});
