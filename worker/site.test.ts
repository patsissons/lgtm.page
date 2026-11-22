import { afterEach, describe, expect, it, vi } from "vitest";
import { sites } from "@shared/apps";
import type { SiteApp } from "@shared/types";
import wranglerConfig from "../wrangler.jsonc?raw";
import {
  PATH_SANDBOX,
  contentType,
  handleSite,
  matchSite,
  type SiteMatch,
} from "./site";

const SOURCE = "https://raw.githubusercontent.com/x/tiny/refs/heads/main/site";
const tiny: SiteApp = {
  slug: "tiny",
  created: "2026-01-01T00:00:00Z",
  updated: "2026-01-01T00:00:00Z",
  site: SOURCE,
};
const table = new Map([["tiny", tiny]]);

describe("matchSite", () => {
  const match = (href: string) => matchSite(new URL(href), table);

  it("matches a site's subdomain, in production and dev", () => {
    expect(match("https://tiny.lgtm.page/a/b.css?x=1")).toEqual({
      entry: tiny,
      mode: "subdomain",
      path: "/a/b.css",
    });
    expect(match("http://tiny.localhost:5173/")).toMatchObject({
      mode: "subdomain",
      path: "/",
    });
  });

  it("matches a site's path under any host", () => {
    expect(match("https://lgtm.page/tiny")).toEqual({
      entry: tiny,
      mode: "path",
      path: "",
    });
    expect(match("http://localhost:5173/tiny/")).toMatchObject({
      mode: "path",
      path: "/",
    });
    expect(match("https://x.workers.dev/tiny/a/b.png")).toMatchObject({
      mode: "path",
      path: "/a/b.png",
    });
  });

  it("leaves everything else to the index", () => {
    expect(match("https://lgtm.page/")).toBeNull();
    expect(match("https://lgtm.page/api/apps")).toBeNull();
    expect(match("https://lgtm.page/tinyx/")).toBeNull();
    expect(match("https://lgtm.page/privacy")).toBeNull();
    expect(match("https://other.lgtm.page/")).toBeNull();
    expect(match("https://tiny.example.com/")).toBeNull();
  });
});

describe("handleSite", () => {
  afterEach(() => vi.restoreAllMocks());

  const upstream = (body: string, init: ResponseInit = {}) =>
    vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(body, {
          headers: {
            "content-type": "text/plain; charset=utf-8",
            "content-security-policy": "default-src 'none'; sandbox",
            "x-frame-options": "deny",
            "set-cookie": "upstream=1",
            etag: '"abc"',
          },
          ...init,
        }),
    );

  function serve(
    href: string,
    fetcher: typeof fetch,
    init: RequestInit = {},
  ): Promise<Response> {
    const url = new URL(href);
    const match = matchSite(url, table) as SiteMatch;
    expect(match).not.toBeNull();
    return handleSite(new Request(url, init), url, match, fetcher);
  }

  it("serves a site's index.html on its subdomain", async () => {
    const fetcher = upstream("<h1>Tiny</h1>");
    const res = await serve("https://tiny.lgtm.page/", fetcher);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("<h1>Tiny</h1>");
    expect(fetcher.mock.calls[0]![0]).toBe(`${SOURCE}/index.html`);
    expect(res.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(res.headers.get("cache-control")).toBe("public, max-age=300");
    expect(res.headers.get("etag")).toBe('"abc"');
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    // Upstream's own security headers and cookies never come through.
    expect(res.headers.get("content-security-policy")).toBeNull();
    expect(res.headers.get("x-frame-options")).toBeNull();
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("sandboxes every file in path mode", async () => {
    const res = await serve("https://lgtm.page/tiny/", upstream("<p>"));
    expect(res.headers.get("content-security-policy")).toBe(PATH_SANDBOX);
    expect(PATH_SANDBOX).not.toContain("allow-same-origin");
    const svg = await serve("https://lgtm.page/tiny/a.svg", upstream("<svg>"));
    expect(svg.headers.get("content-security-policy")).toBe(PATH_SANDBOX);
    expect(svg.headers.get("content-type")).toBe("image/svg+xml");
  });

  it("adds the trailing slash a site's root needs in path mode", async () => {
    const fetcher = upstream("");
    const res = await serve("https://lgtm.page/tiny?x=1", fetcher);
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe("https://lgtm.page/tiny/?x=1");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("fetches nested files and directories, without the query", async () => {
    const fetcher = upstream("body{}");
    await serve("https://lgtm.page/tiny/css/a.css?v=2", fetcher);
    await serve("https://tiny.lgtm.page/docs/", fetcher);
    expect(fetcher.mock.calls.map(([input]) => input)).toEqual([
      `${SOURCE}/css/a.css`,
      `${SOURCE}/docs/index.html`,
    ]);
  });

  it("forwards nothing from the visitor's request", async () => {
    const fetcher = upstream("");
    await serve("https://tiny.lgtm.page/", fetcher, {
      headers: { cookie: "lgtm_session=secret", authorization: "Bearer x" },
    });
    const headers = new Headers(fetcher.mock.calls[0]![1]!.headers);
    expect(headers.get("cookie")).toBeNull();
    expect(headers.get("authorization")).toBeNull();
    expect(headers.get("user-agent")).toMatch(/lgtm\.page/);
  });

  it("keeps upstream's type for an unknown extension", async () => {
    const fetcher = upstream("x", {
      headers: { "content-type": "application/pdf" },
    });
    const res = await serve("https://tiny.lgtm.page/a.pdf", fetcher);
    expect(res.headers.get("content-type")).toBe("application/pdf");
  });

  it("answers HEAD without a body", async () => {
    const res = await serve("https://tiny.lgtm.page/", upstream("<p>"), {
      method: "HEAD",
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(await res.text()).toBe("");
  });

  it("only serves GET and HEAD", async () => {
    const fetcher = upstream("");
    const res = await serve("https://tiny.lgtm.page/", fetcher, {
      method: "POST",
    });
    expect(res.status).toBe(405);
    expect(res.headers.get("allow")).toBe("GET, HEAD");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("passes on a missing file as 404 and other failures as 502", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const missing = await serve(
      "https://tiny.lgtm.page/nope.html",
      upstream("404: Not Found", { status: 404 }),
    );
    expect(missing.status).toBe(404);
    expect(await missing.text()).toBe("Not found");

    const broken = await serve(
      "https://tiny.lgtm.page/",
      upstream("", { status: 500 }),
    );
    expect(broken.status).toBe(502);

    const down = await serve("https://tiny.lgtm.page/", (async () => {
      throw new TypeError("network");
    }) as typeof fetch);
    expect(down.status).toBe(502);
  });

  it("never fetches outside the site's source", async () => {
    const fetcher = upstream("");
    const url = new URL("https://tiny.lgtm.page/");
    const res = await handleSite(
      new Request(url),
      url,
      { entry: tiny, mode: "subdomain", path: "/../secret" },
      fetcher,
    );
    expect(res.status).toBe(404);
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe("contentType", () => {
  it("types files by extension, case-insensitively", () => {
    expect(contentType(`${SOURCE}/a.JS`)).toBe(
      "text/javascript; charset=utf-8",
    );
    expect(contentType(`${SOURCE}/fonts/a.woff2`)).toBe("font/woff2");
    expect(contentType(`${SOURCE}/LICENSE`)).toBeUndefined();
    expect(contentType(`${SOURCE}/a.unknown`)).toBeUndefined();
  });
});

describe("wrangler.jsonc", () => {
  /** wrangler.jsonc without its comments and trailing commas. */
  const config = JSON.parse(
    wranglerConfig
      .replace(/("(?:\\.|[^"\\])*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, "$1")
      .replace(/,(\s*[}\]])/g, "$1"),
  ) as { routes: { pattern: string; custom_domain?: boolean }[] };
  const subdomains = config.routes
    .filter((route) => route.pattern.endsWith(".lgtm.page"))
    .map((route) => route.pattern.slice(0, -".lgtm.page".length));

  it("gives every site its subdomain as a custom domain", () => {
    for (const slug of sites.keys()) {
      expect(config.routes).toContainEqual({
        pattern: `${slug}.lgtm.page`,
        custom_domain: true,
      });
    }
  });

  it("routes no other subdomain here but www and auth", () => {
    expect(subdomains.sort()).toEqual(["auth", "www", ...sites.keys()].sort());
  });
});
