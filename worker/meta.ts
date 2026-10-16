import type { AppMeta } from "@shared/types";

const TAG = /<(meta|link)\b([^>]*)>/gi;
const ATTR = /([^\s=/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
const TITLE = /<title\b[^>]*>([\s\S]*?)<\/title>/gi;
const NAMED: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/**
 * Reads an app's link-preview metadata from its HTML. Only <meta>, <link>
 * and <title> matter, so a small tag scanner is enough (and, unlike
 * HTMLRewriter, it runs in the unit tests outside workerd). The whole
 * document is scanned because some frameworks (Next.js streaming metadata)
 * put the tags in <body>; the first non-empty value wins, so <head> does.
 */
export function parseMeta(html: string, baseUrl: string): AppMeta {
  const props = new Map<string, string>();
  const icons = new Map<string, string>();
  for (const [, tag, rest] of html.matchAll(TAG)) {
    const attrs = parseAttrs(rest!);
    if (tag!.toLowerCase() === "meta") {
      const key = (attrs.property ?? attrs.name)?.toLowerCase();
      const content = attrs.content?.trim();
      if (key && content && !props.has(key)) props.set(key, content);
    } else if (attrs.href) {
      for (const rel of (attrs.rel ?? "").toLowerCase().split(/\s+/)) {
        if (!icons.has(rel)) icons.set(rel, attrs.href);
      }
    }
  }

  const pick = (...keys: string[]) =>
    keys.map((k) => props.get(k)).find((v) => v);
  const title = Array.from(html.matchAll(TITLE), ([, text]) =>
    decode(text!).trim(),
  ).find((text) => text);

  return clean({
    title: pick("og:title", "twitter:title") ?? title,
    description: pick("og:description", "twitter:description", "description"),
    image: resolve(pick("og:image", "og:image:url", "twitter:image"), baseUrl),
    imageAlt: pick("og:image:alt", "twitter:image:alt"),
    themeColor: pick("theme-color"),
    icon: resolve(icons.get("icon") ?? icons.get("apple-touch-icon"), baseUrl),
  });
}

function parseAttrs(source: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const [, name, dq, sq, bare] of source.matchAll(ATTR)) {
    attrs[name!.toLowerCase()] = decode(dq ?? sq ?? bare ?? "");
  }
  return attrs;
}

export function decode(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity) => {
    const e = (entity as string).toLowerCase();
    if (e.startsWith("#x")) return safeCodePoint(parseInt(e.slice(2), 16));
    if (e.startsWith("#")) return safeCodePoint(parseInt(e.slice(1), 10));
    return NAMED[e] ?? match;
  });
}

function safeCodePoint(code: number): string {
  try {
    return String.fromCodePoint(code);
  } catch {
    return "�";
  }
}

export function resolve(
  value: string | undefined,
  base: string,
): string | undefined {
  if (!value) return undefined;
  try {
    return new URL(value, base).href;
  } catch {
    return undefined;
  }
}

/** Drops undefined keys so cards serialize (and compare) cleanly. */
function clean(meta: AppMeta): AppMeta {
  return Object.fromEntries(
    Object.entries(meta).filter(([, v]) => v !== undefined),
  ) as AppMeta;
}
