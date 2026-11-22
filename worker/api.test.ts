import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apps, appsVersion } from "@shared/apps";
import type { AppCard, AppEntry } from "@shared/types";
import {
  FRESH_ERROR_MS,
  FRESH_MS,
  githubTags,
  handleApi,
  loadApps,
  repoFile,
  sourceOf,
  toCard,
} from "./api";

const page = (title: string) =>
  `<head><meta property="og:title" content="${title}">
   <meta property="og:image" content="/og.png"></head>`;

/** An in-memory stand-in for caches.default (absent outside workerd). */
class FakeCache {
  store = new Map<string, Response>();
  async match(req: Request) {
    return this.store.get(req.url)?.clone();
  }
  async put(req: Request, res: Response) {
    this.store.set(req.url, res);
  }
}

describe("loadApps", () => {
  const entry: AppEntry = {
    slug: "a",
    created: "2026-01-01T00:00:00Z",
    updated: "2026-01-01T00:00:00Z",
    url: "https://a.lgtm.page/",
  };

  it("builds a card from the app's tags", async () => {
    const fetcher = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(page("A")),
    );
    const [card] = await loadApps([entry], fetcher);
    expect(card).toEqual({
      slug: "a",
      created: "2026-01-01T00:00:00Z",
      updated: "2026-01-01T00:00:00Z",
      url: "https://a.lgtm.page/",
      host: "a.lgtm.page",
      title: "A",
      image: "https://a.lgtm.page/og.png",
      status: "ok",
    });
    const init = fetcher.mock.calls[0]![1] as RequestInit;
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("keeps a failing app in the list, in registry order", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("https://down.")) throw new TypeError("network");
      if (url.startsWith("https://slow.")) {
        throw new DOMException("timed out", "TimeoutError");
      }
      if (url.startsWith("https://gone.")) {
        return new Response("nope", { status: 404 });
      }
      return new Response(page("Up"));
    });
    const cards = await loadApps(
      [
        {
          slug: "down",
          created: "2026-01-01T00:00:00Z",
          updated: "2026-01-01T00:00:00Z",
          url: "https://down.lgtm.page/",
        },
        {
          slug: "up",
          created: "2026-01-01T00:00:00Z",
          updated: "2026-01-01T00:00:00Z",
          url: "https://up.lgtm.page/",
        },
        {
          slug: "slow",
          created: "2026-01-01T00:00:00Z",
          updated: "2026-01-01T00:00:00Z",
          url: "https://slow.lgtm.page/",
        },
        {
          slug: "gone",
          created: "2026-01-01T00:00:00Z",
          updated: "2026-01-01T00:00:00Z",
          url: "https://gone.lgtm.page/",
        },
      ],
      fetcher as typeof fetch,
    );
    expect(cards.map((c) => [c.slug, c.status, c.title])).toEqual([
      ["down", "error", "down.lgtm.page"],
      ["up", "ok", "Up"],
      ["slow", "error", "slow.lgtm.page"],
      ["gone", "error", "gone.lgtm.page"],
    ]);
  });
});

describe("toCard", () => {
  it("carries the registry's dates, even for a failed fetch", () => {
    const entry: AppEntry = {
      slug: "a",
      created: "2026-01-01T00:00:00Z",
      updated: "2026-02-03T00:00:00Z",
      url: "https://a.lgtm.page/",
    };
    for (const status of ["ok", "error"] as const) {
      expect(toCard(entry, {}, status)).toMatchObject({
        created: "2026-01-01T00:00:00Z",
        updated: "2026-02-03T00:00:00Z",
      });
    }
  });

  it("lets registry overrides win over the app's tags", () => {
    const card = toCard(
      {
        slug: "a",
        created: "2026-01-01T00:00:00Z",
        updated: "2026-01-01T00:00:00Z",
        url: "https://a.lgtm.page/app/",
        repo: "https://github.com/x/a",
        title: "Override",
        description: "Better words",
        image: "hero.png",
      },
      { title: "Tag", description: "Tag words", image: "https://x/og.png" },
      "ok",
    );
    expect(card).toMatchObject({
      title: "Override",
      description: "Better words",
      image: "https://a.lgtm.page/app/hero.png",
      repo: "https://github.com/x/a",
    });
  });

  it("keeps the image override when the app could not be fetched", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetcher = vi.fn(async () => new Response("", { status: 503 }));
    const [card] = await loadApps(
      [
        {
          slug: "a",
          created: "2026-01-01T00:00:00Z",
          updated: "2026-01-01T00:00:00Z",
          url: "https://a.lgtm.page/",
          image: "/fallback.png",
        },
      ],
      fetcher as typeof fetch,
    );
    expect(card).toMatchObject({
      status: "error",
      image: "https://a.lgtm.page/fallback.png",
    });
    vi.restoreAllMocks();
  });
});

describe("repo-only apps", () => {
  const entry: AppEntry = {
    slug: "macbat",
    created: "2026-01-01T00:00:00Z",
    updated: "2026-01-01T00:00:00Z",
    repo: "https://github.com/patsissons/macbat",
  };
  const github = `<head>
    <meta property="og:title" content="GitHub - patsissons/macbat: Power monitor">
    <meta property="og:description" content="Power monitor - patsissons/macbat">
    <meta property="og:image" content="https://opengraph.githubassets.com/1/patsissons/macbat">
    <meta property="og:image:alt" content="Power monitor - patsissons/macbat">
  </head>`;

  it("builds the card from the repo's GitHub page", async () => {
    const fetcher = vi.fn(async () => new Response(github));
    const [card] = await loadApps([entry], fetcher as typeof fetch);
    expect(fetcher).toHaveBeenCalledWith(
      "https://github.com/patsissons/macbat",
      expect.anything(),
    );
    expect(card).toEqual({
      slug: "macbat",
      created: "2026-01-01T00:00:00Z",
      updated: "2026-01-01T00:00:00Z",
      url: "https://github.com/patsissons/macbat",
      host: "github.com",
      title: "macbat",
      description: "Power monitor",
      image: "https://opengraph.githubassets.com/1/patsissons/macbat",
      imageAlt: "Power monitor",
      status: "ok",
    });
  });

  it("keeps the repo name as the title when GitHub is unreachable", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetcher = vi.fn(async () => new Response("", { status: 429 }));
    const [card] = await loadApps([entry], fetcher as typeof fetch);
    expect(card).toEqual({
      slug: "macbat",
      created: "2026-01-01T00:00:00Z",
      updated: "2026-01-01T00:00:00Z",
      url: "https://github.com/patsissons/macbat",
      host: "github.com",
      title: "macbat",
      status: "error",
    });
    vi.restoreAllMocks();
  });

  it("still lets registry overrides win", () => {
    const card = toCard(
      { ...entry, title: "MacBat", description: "Better", image: "/x.png" },
      { title: "GitHub - patsissons/macbat: x", description: "x" },
      "ok",
    );
    expect(card).toMatchObject({
      title: "MacBat",
      description: "Better",
      image: "https://raw.githubusercontent.com/patsissons/macbat/HEAD/x.png",
    });
  });

  it("shows the image override when GitHub is unreachable", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetcher = vi.fn(async () => {
      throw new TypeError("network");
    });
    const [card] = await loadApps(
      [{ ...entry, image: "assets/screenshot.svg" }],
      fetcher as typeof fetch,
    );
    expect(card).toMatchObject({
      status: "error",
      title: "macbat",
      image:
        "https://raw.githubusercontent.com/patsissons/macbat/HEAD/assets/screenshot.svg",
    });
    vi.restoreAllMocks();
  });

  it.each([
    [
      "assets/shot.svg",
      "https://raw.githubusercontent.com/o/r/HEAD/assets/shot.svg",
    ],
    [
      "./assets/shot.svg",
      "https://raw.githubusercontent.com/o/r/HEAD/assets/shot.svg",
    ],
    [
      "/assets/shot.svg",
      "https://raw.githubusercontent.com/o/r/HEAD/assets/shot.svg",
    ],
    ["https://cdn.example/shot.png", "https://cdn.example/shot.png"],
    ["//cdn.example/shot.png", "https://cdn.example/shot.png"],
  ])("reads image %s from the repo as %s", (path, url) => {
    expect(repoFile(path, "https://github.com/o/r")).toBe(url);
  });

  it("has no image without an override", () => {
    expect(repoFile(undefined, "https://github.com/o/r")).toBeUndefined();
  });

  it("only trims GitHub's own suffix", () => {
    expect(
      githubTags(
        { description: "Uses - patsissons/other", imageAlt: "Alt" },
        "https://github.com/patsissons/macbat",
      ),
    ).toEqual({
      title: "macbat",
      description: "Uses - patsissons/other",
      imageAlt: "Alt",
    });
  });
});

describe("site apps", () => {
  const entry: AppEntry = {
    slug: "tiny",
    created: "2026-01-01T00:00:00Z",
    updated: "2026-01-01T00:00:00Z",
    site: "https://raw.githubusercontent.com/x/tiny/refs/heads/main/site",
    repo: "https://github.com/x/tiny",
  };

  it("reads the tags from the site's index.html at its source", async () => {
    const fetcher = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(page("Tiny"), {
          headers: { "content-type": "text/plain" },
        }),
    );
    const [card] = await loadApps([entry], fetcher);
    expect(fetcher.mock.calls[0]![0]).toBe(
      "https://raw.githubusercontent.com/x/tiny/refs/heads/main/site/index.html",
    );
    expect(sourceOf(entry)).toBe(fetcher.mock.calls[0]![0]);
    // It links to, and resolves relative tags against, its subdomain.
    expect(card).toEqual({
      slug: "tiny",
      created: "2026-01-01T00:00:00Z",
      updated: "2026-01-01T00:00:00Z",
      url: "https://tiny.lgtm.page/",
      host: "tiny.lgtm.page",
      title: "Tiny",
      image: "https://tiny.lgtm.page/og.png",
      repo: "https://github.com/x/tiny",
      status: "ok",
    });
  });

  it("resolves an image override against its subdomain", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetcher = vi.fn(async () => new Response("", { status: 404 }));
    const [card] = await loadApps(
      [{ ...entry, image: "shot.png" }],
      fetcher as typeof fetch,
    );
    expect(card).toMatchObject({
      status: "error",
      title: "tiny.lgtm.page",
      image: "https://tiny.lgtm.page/shot.png",
    });
    vi.restoreAllMocks();
  });
});

describe("handleApi", () => {
  let cache: FakeCache;
  let pending: Promise<unknown>[];
  const ctx = {
    waitUntil: (p: Promise<unknown>) => pending.push(p),
  } as unknown as ExecutionContext;
  const live = async () => new Response(page("Live"));
  const fetchMock = vi.fn(live);

  function call(path: string, init?: RequestInit) {
    const url = new URL(`https://lgtm.page${path}`);
    return handleApi(new Request(url, init), {} as never, ctx, url);
  }

  async function titles(res: Response) {
    return ((await res.json()) as AppCard[]).map((c) => c.title);
  }

  /**
   * The titles expected when every registered app serves `title`; a
   * repo-only card is always titled with its repo's name.
   */
  const every = (title: string) =>
    apps.map((app) =>
      app.url === undefined && app.site === undefined
        ? app.repo.split("/").pop()
        : title,
    );

  beforeEach(() => {
    cache = new FakeCache();
    pending = [];
    fetchMock.mockClear().mockImplementation(live);
    vi.stubGlobal("caches", { default: cache });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("answers the health check", async () => {
    const res = await call("/api/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("returns 404 for unknown routes and methods", async () => {
    expect((await call("/api/nope")).status).toBe(404);
    expect((await call("/api/apps", { method: "POST" })).status).toBe(404);
  });

  it("fetches every registered app once, then serves the cache", async () => {
    const first = await call("/api/apps");
    expect(first.status).toBe(200);
    expect(first.headers.get("cache-control")).toBe("public, max-age=300");
    expect(await titles(first)).toEqual(every("Live"));
    expect(fetchMock).toHaveBeenCalledTimes(apps.length);
    for (const app of apps) {
      expect(fetchMock).toHaveBeenCalledWith(sourceOf(app), expect.anything());
    }

    // Query strings share one cache entry.
    expect(await titles(await call("/api/apps?x=1"))).toEqual(every("Live"));
    expect(fetchMock).toHaveBeenCalledTimes(apps.length);
    expect(pending).toHaveLength(0);
  });

  it("serves a stale entry while refreshing it in the background", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    await call("/api/apps");
    fetchMock.mockImplementation(async () => new Response(page("Newer")));

    vi.setSystemTime(Date.now() + FRESH_MS + 1);
    expect(await titles(await call("/api/apps"))).toEqual(every("Live"));
    expect(pending).toHaveLength(1);
    await Promise.all(pending);
    expect(await titles(await call("/api/apps"))).toEqual(every("Newer"));
  });

  it("refreshes sooner when an app failed", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.useFakeTimers({ toFake: ["Date"] });
    fetchMock.mockImplementation(async () => new Response("", { status: 500 }));
    await call("/api/apps");

    vi.setSystemTime(Date.now() + FRESH_ERROR_MS + 1);
    await call("/api/apps");
    expect(pending).toHaveLength(1);
  });

  it("ignores a list cached for another registry", async () => {
    for (const old of ["/api/apps", "/api/apps?v=old"]) {
      cache.store.set(
        `https://lgtm.page${old}`,
        new Response(JSON.stringify([{ title: "Old" }])),
      );
    }
    expect(await titles(await call("/api/apps"))).toEqual(every("Live"));
    expect(fetchMock).toHaveBeenCalledTimes(apps.length);
    expect(cache.store.has(`https://lgtm.page/api/apps?v=${appsVersion}`)).toBe(
      true,
    );
  });

  it("skips the cache with ?refresh", async () => {
    await call("/api/apps");
    fetchMock.mockImplementation(async () => new Response(page("Forced")));
    expect(await titles(await call("/api/apps?refresh=1"))).toEqual(
      every("Forced"),
    );
    expect(await titles(await call("/api/apps"))).toEqual(every("Forced"));
  });
});
