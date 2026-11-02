export function parseCookies(header: string | null): Record<string, string> {
  const cookies: Record<string, string> = {};
  for (const part of header?.split(";") ?? []) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    cookies[part.slice(0, index).trim()] = part.slice(index + 1).trim();
  }
  return cookies;
}

export interface CookieOptions {
  maxAge: number;
  /** Omitted on plain-http local dev, where WebKit drops Secure cookies. */
  secure: boolean;
}

/** HttpOnly, SameSite=Lax (still sent on the top-level redirect back from a provider), Path=/. */
export function cookieHeader(
  name: string,
  value: string,
  options: CookieOptions,
): string {
  const parts = [
    `${name}=${value}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${options.maxAge}`,
  ];
  if (options.secure) parts.push("Secure");
  return parts.join("; ");
}

export function clearCookieHeader(name: string, secure: boolean): string {
  return cookieHeader(name, "", { maxAge: 0, secure });
}
