import type { Mount, Provider } from "./types";

const CSS = `
:root { color-scheme: light dark; --bg: #fafafa; --fg: #18181b; --muted: #71717a; --card: #fff; --border: #e4e4e7; --accent: #18181b; --accent-fg: #fff; }
@media (prefers-color-scheme: dark) { :root { --bg: #09090b; --fg: #fafafa; --muted: #a1a1aa; --card: #18181b; --border: #27272a; --accent: #fafafa; --accent-fg: #18181b; } }
* { box-sizing: border-box; }
body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 16px; background: var(--bg); color: var(--fg); font: 16px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
main { width: 100%; max-width: 380px; background: var(--card); border: 1px solid var(--border); border-radius: 16px; padding: 28px 24px; }
h1 { font-size: 1.25rem; margin: 0 0 4px; }
p { margin: 0 0 20px; color: var(--muted); }
p:last-child { margin-bottom: 0; }
a.button { display: block; text-align: center; margin-top: 10px; padding: 11px 14px; border-radius: 10px; border: 1px solid var(--border); background: var(--accent); color: var(--accent-fg); text-decoration: none; font-weight: 600; }
a.button.secondary { background: transparent; color: var(--fg); }
a.button:focus-visible { outline: 2px solid var(--fg); outline-offset: 2px; }
code { font-size: 0.9em; }
`;

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)}</title>
<style>${CSS}</style>
</head>
<body>
<main>
${body}
</main>
</body>
</html>
`;
}

const PROVIDER_LABEL: Record<Provider, string> = {
  github: "Continue with GitHub",
  google: "Continue with Google",
};

/** The provider chooser; each link is the same request plus `provider=`. */
export function chooserPage(
  clientId: string,
  links: Record<Provider, string>,
): string {
  const buttons = (Object.keys(links) as Provider[])
    .map(
      (provider, i) =>
        `<a class="button${i ? " secondary" : ""}" href="${escapeHtml(links[provider])}">${PROVIDER_LABEL[provider]}</a>`,
    )
    .join("\n");
  return page(
    `Sign in to ${clientId}`,
    `<h1>Sign in to ${escapeHtml(clientId)}</h1>
<p>${escapeHtml(clientId)} uses lgtm.page sign-in. Choose how to continue.</p>
${buttons}`,
  );
}

export function errorPage(title: string, message: string): string {
  return page(
    title,
    `<h1>${escapeHtml(title)}</h1>
<p>${escapeHtml(message)}</p>`,
  );
}

export function signedOutPage(): string {
  return page(
    "Signed out",
    `<h1>Signed out</h1>
<p>You are signed out of lgtm.page sign-in on this browser.</p>`,
  );
}

export function homePage(mount: Mount): string {
  const discovery = `${mount.issuer}/.well-known/openid-configuration`;
  return page(
    "lgtm.page sign-in",
    `<h1>lgtm.page sign-in</h1>
<p>The OpenID Connect provider behind sign-in for lgtm.page apps. Discovery: <a href="${escapeHtml(discovery)}"><code>${escapeHtml(discovery)}</code></a>.</p>
<p><a href="https://github.com/patsissons/lgtm#using-lgtmpage-sign-in-from-an-app">How to use it from an app</a></p>`,
  );
}
