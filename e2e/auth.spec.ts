import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";

// The broker is path-mounted on the dev server, and the "providers" are
// e2e/stub-provider.ts, so these run the real redirect dance end to end.
// The callback lands on a path the dev server 404s, which is fine: the
// browser still ends up on it and the code is in its URL.
const CALLBACK = "http://localhost:5198/e2e/callback";

interface Discovery {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint: string;
  jwks_uri: string;
  end_session_endpoint: string;
}

function base64url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

async function pkce() {
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  return { verifier, challenge: base64url(new Uint8Array(digest)) };
}

async function discover(request: APIRequestContext): Promise<Discovery> {
  const res = await request.get("/auth/.well-known/openid-configuration");
  expect(res.ok()).toBeTruthy();
  return (await res.json()) as Discovery;
}

function authorizeUrl(
  doc: Discovery,
  challenge: string,
  extra: Record<string, string> = {},
): string {
  const url = new URL(doc.authorization_endpoint);
  for (const [name, value] of Object.entries({
    client_id: "wavelength",
    redirect_uri: CALLBACK,
    response_type: "code",
    scope: "openid email profile",
    state: "e2e-state",
    nonce: "e2e-nonce",
    code_challenge: challenge,
    code_challenge_method: "S256",
    ...extra,
  })) {
    url.searchParams.set(name, value);
  }
  return url.href;
}

/** Waits for the browser to land back on the app and returns the query. */
async function backAtApp(page: Page): Promise<URLSearchParams> {
  await page.waitForURL((url) => url.href.startsWith(CALLBACK));
  return new URL(page.url()).searchParams;
}

async function verifyIdToken(
  request: APIRequestContext,
  doc: Discovery,
  idToken: string,
) {
  const jwks = (await (await request.get(doc.jwks_uri)).json()) as {
    keys: (JsonWebKey & { kid: string })[];
  };
  const [header, payload, signature] = idToken.split(".");
  const { kid } = JSON.parse(Buffer.from(header, "base64url").toString()) as {
    kid: string;
  };
  const jwk = jwks.keys.find((key) => key.kid === kid);
  expect(jwk, "id_token kid is published").toBeTruthy();
  const key = await crypto.subtle.importKey(
    "jwk",
    jwk!,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["verify"],
  );
  const valid = await crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    Buffer.from(signature, "base64url"),
    new TextEncoder().encode(`${header}.${payload}`),
  );
  expect(valid).toBe(true);
  return JSON.parse(Buffer.from(payload, "base64url").toString()) as Record<
    string,
    unknown
  >;
}

test("publishes discovery and JWKS from the dev mount", async ({ request }) => {
  const doc = await discover(request);
  expect(doc.issuer).toBe("http://localhost:5198/auth");
  expect(doc.token_endpoint).toBe("http://localhost:5198/auth/token");
  const jwks = await request.get(doc.jwks_uri);
  expect(jwks.headers()["access-control-allow-origin"]).toBe("*");
  const { keys } = (await jwks.json()) as { keys: Record<string, unknown>[] };
  expect(keys.length).toBeGreaterThan(0);
  expect(keys[0]).not.toHaveProperty("d");
});

test("signs in with GitHub, redeems the code, then signs in silently and signs out", async ({
  page,
  request,
}) => {
  const doc = await discover(request);
  const { verifier, challenge } = await pkce();

  await page.goto(authorizeUrl(doc, challenge));
  await expect(
    page.getByRole("heading", { name: "Sign in to wavelength" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Continue with GitHub" }).click();

  const query = await backAtApp(page);
  expect(query.get("state")).toBe("e2e-state");
  expect(query.get("iss")).toBe(doc.issuer);
  expect(query.get("error")).toBeNull();
  const code = query.get("code");
  expect(code).toBeTruthy();

  const form = {
    grant_type: "authorization_code",
    code: code!,
    redirect_uri: CALLBACK,
    client_id: "wavelength",
    code_verifier: verifier,
  };
  const tokenRes = await request.post(doc.token_endpoint, { form });
  expect(tokenRes.status()).toBe(200);
  expect(tokenRes.headers()["cache-control"]).toBe("no-store");
  const tokens = (await tokenRes.json()) as Record<string, string>;
  expect(tokens.token_type).toBe("Bearer");

  const claims = await verifyIdToken(request, doc, tokens.id_token);
  expect(claims).toMatchObject({
    iss: doc.issuer,
    aud: "wavelength",
    sub: "github:7",
    nonce: "e2e-nonce",
    email: "pat@example.com",
    email_verified: true,
    preferred_username: "e2e-pat",
    provider: "github",
  });

  const userinfo = await request.get(doc.userinfo_endpoint, {
    headers: { authorization: `Bearer ${tokens.access_token}` },
  });
  expect(userinfo.status()).toBe(200);
  expect(((await userinfo.json()) as { sub: string }).sub).toBe("github:7");

  // A code is single-use.
  const replay = await request.post(doc.token_endpoint, { form });
  expect(replay.status()).toBe(400);
  expect(((await replay.json()) as { error: string }).error).toBe(
    "invalid_grant",
  );

  // The broker remembers the sign-in: no chooser the second time.
  await page.goto(authorizeUrl(doc, challenge, { state: "again" }));
  const again = await backAtApp(page);
  expect(again.get("state")).toBe("again");
  expect(again.get("code")).toBeTruthy();

  // Signing out at the broker brings the chooser back.
  await page.goto(
    `${doc.end_session_endpoint}?client_id=wavelength&post_logout_redirect_uri=${encodeURIComponent(CALLBACK)}`,
  );
  await backAtApp(page);
  await page.goto(authorizeUrl(doc, challenge));
  await expect(
    page.getByRole("heading", { name: "Sign in to wavelength" }),
  ).toBeVisible();
});

test("signs in with Google when the app picks the provider", async ({
  page,
  request,
}) => {
  const doc = await discover(request);
  const { verifier, challenge } = await pkce();
  await page.goto(authorizeUrl(doc, challenge, { provider: "google" }));
  const query = await backAtApp(page);
  const tokenRes = await request.post(doc.token_endpoint, {
    form: {
      grant_type: "authorization_code",
      code: query.get("code")!,
      redirect_uri: CALLBACK,
      client_id: "wavelength",
      code_verifier: verifier,
    },
  });
  expect(tokenRes.status()).toBe(200);
  const { id_token } = (await tokenRes.json()) as { id_token: string };
  const claims = await verifyIdToken(request, doc, id_token);
  expect(claims.sub).toBe("google:g-7");
  expect(claims.email).toBe("pat@gmail.example");
});

test("refuses an unknown app or redirect without redirecting", async ({
  page,
}) => {
  const unknown = await page.goto(
    `/auth/authorize?client_id=nope&redirect_uri=${encodeURIComponent(CALLBACK)}&response_type=code`,
  );
  expect(unknown?.status()).toBe(400);
  await expect(
    page.getByRole("heading", { name: "Unknown app" }),
  ).toBeVisible();
  const evil = await page.goto(
    "/auth/authorize?client_id=wavelength&redirect_uri=https%3A%2F%2Fevil.example%2F&response_type=code",
  );
  expect(evil?.status()).toBe(400);
  await expect(
    page.getByRole("heading", { name: "Bad redirect" }),
  ).toBeVisible();
});

test("the index does not serve the broker under /auth on lgtm.page hosts", async ({
  request,
}) => {
  // On the dev host /auth/* is the broker; the production host rule is unit
  // tested (authMount). Here: the API and the page still work alongside it.
  const health = await request.get("/api/health");
  expect(await health.json()).toEqual({ ok: true });
  const notFound = await request.get("/auth/nope");
  expect(notFound.status()).toBe(404);
});
