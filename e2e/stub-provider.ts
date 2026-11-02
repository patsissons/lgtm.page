/**
 * Stands in for GitHub and Google during the e2e suite. The Worker is pointed
 * at it with `AUTH_PROVIDER_ORIGIN` (wrangler.jsonc, env `e2e`); the two
 * providers' paths do not collide, so one origin serves both. Every sign-in
 * succeeds immediately as the same canned user.
 *
 *   node e2e/stub-provider.ts [port]
 */
import { createServer } from "node:http";

const port = Number(process.argv[2] ?? 5199);

const GITHUB_USER = {
  id: 7,
  login: "e2e-pat",
  name: "Pat E2E",
  avatar_url: "https://avatars.example/7",
};
const GITHUB_EMAILS = [
  { email: "unverified@example.com", primary: false, verified: false },
  { email: "pat@example.com", primary: true, verified: true },
];
const GOOGLE_CLAIMS = {
  iss: "https://accounts.google.com",
  aud: "e2e-google-client",
  sub: "g-7",
  email: "pat@gmail.example",
  email_verified: true,
  name: "Pat E2E",
  picture: "https://lh3.example/7",
};

function base64url(text: string): string {
  return Buffer.from(text).toString("base64url");
}

/** An unsigned id_token: the broker trusts the token endpoint, not the signature. */
function googleIdToken(): string {
  return `${base64url(JSON.stringify({ alg: "none" }))}.${base64url(JSON.stringify(GOOGLE_CLAIMS))}.`;
}

function json(body: unknown) {
  return [
    200,
    { "content-type": "application/json" },
    JSON.stringify(body),
  ] as const;
}

/** Bounces straight back to the broker's callback with a code. */
function consent(url: URL) {
  const back = new URL(url.searchParams.get("redirect_uri")!);
  back.searchParams.set("code", `${url.pathname}-code`);
  back.searchParams.set("state", url.searchParams.get("state") ?? "");
  return [302, { location: back.href }, ""] as const;
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${port}`);
  const route = `${req.method} ${url.pathname}`;
  const [status, headers, body] = (() => {
    switch (route) {
      case "GET /health":
        return json({ ok: true });
      case "GET /login/oauth/authorize":
      case "GET /o/oauth2/v2/auth":
        return consent(url);
      case "POST /login/oauth/access_token":
        return json({ access_token: "e2e-github-token", token_type: "bearer" });
      case "GET /user":
        return json(GITHUB_USER);
      case "GET /user/emails":
        return json(GITHUB_EMAILS);
      case "POST /token":
        return json({
          access_token: "e2e-google-token",
          id_token: googleIdToken(),
        });
      default:
        return [
          404,
          { "content-type": "text/plain" },
          `stub provider: no ${route}`,
        ] as const;
    }
  })();
  res.writeHead(status, headers);
  res.end(body);
});

server.listen(port, () => {
  console.log(`stub provider listening on http://localhost:${port}`);
});
