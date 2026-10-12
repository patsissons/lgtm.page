import type { AppMeta } from "@shared/types";

const TAG = /<(meta|link)\b([^>]*)>/gi;
const ATTR = /([^\s=/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
const TITLE = /<title\b[^>]*>([\s\S]*?)<\/title>/i;
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
 * and <title> in the <head> matter, so a small tag scanner is enough (and,
 * unlike HTMLRewriter, it runs in the unit tests outside workerd).
 */
export function parseMeta(html: string, baseUrl: string): AppMeta {
  const end = html.search(/<\/head>/i);
  const head = end === -1 ? html : html.slice(0, end);

  const props = new Map<string, string>();
  const icons = new Map<string, string>();
  for (const [, tag, rest] of head.matchAll(TAG)) {
    const attrs = parseAttrs(rest!);
    if (tag!.toLowerCase() === "meta") {
      const key = (attrs.property ?? attrs.name)?.toLowerCase();
      if (key && attrs.content !== undefined && !props.has(key)) {
        props.set(key, attrs.content.trim());
      }
    } else if (attrs.href) {
      for (const rel of (attrs.rel ?? "").toLowerCase().split(/\s+/)) {
        if (!icons.has(rel)) icons.set(rel, attrs.href);
      }
    }
  }

  const pick = (...keys: string[]) =>
    keys.map((k) => props.get(k)).find((v) => v) || undefined;
  const title = head.match(TITLE)?.[1];

  return clean({
    title:
      pick("og:title", "twitter:title") ??
      (title ? decode(title).trim() || undefined : undefined),
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
