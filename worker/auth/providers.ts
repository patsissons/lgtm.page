import { decodeJwtPayload } from "./jwt";
import type { AuthEnv } from "./env";
import type { Identity, Provider } from "./types";

const ENDPOINTS = {
  github: {
    authorize: "https://github.com/login/oauth/authorize",
    token: "https://github.com/login/oauth/access_token",
    user: "https://api.github.com/user",
    emails: "https://api.github.com/user/emails",
    scope: "read:user user:email",
  },
  google: {
    authorize: "https://accounts.google.com/o/oauth2/v2/auth",
    token: "https://oauth2.googleapis.com/token",
    scope: "openid email profile",
  },
} as const;

const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];
const USER_AGENT = "lgtm.page-auth (+https://auth.lgtm.page)";

type ProviderEnv = Pick<
  AuthEnv,
  | "AUTH_PROVIDER_ORIGIN"
  | "GITHUB_CLIENT_ID"
  | "GITHUB_CLIENT_SECRET"
  | "GOOGLE_CLIENT_ID"
  | "GOOGLE_CLIENT_SECRET"
>;

/**
 * Every provider URL, rebased onto `AUTH_PROVIDER_ORIGIN` when it is set so
 * the e2e suite can stand in for GitHub and Google (their paths don't collide).
 */
export function upstream(env: ProviderEnv, url: string): string {
  if (!env.AUTH_PROVIDER_ORIGIN) return url;
  const parsed = new URL(url);
  return `${env.AUTH_PROVIDER_ORIGIN}${parsed.pathname}${parsed.search}`;
}

function credentials(env: ProviderEnv, provider: Provider) {
  return provider === "github"
    ? { id: env.GITHUB_CLIENT_ID, secret: env.GITHUB_CLIENT_SECRET }
    : { id: env.GOOGLE_CLIENT_ID, secret: env.GOOGLE_CLIENT_SECRET };
}

/** Where to send the user to sign in at the provider. */
export function providerAuthorizeUrl(
  env: ProviderEnv,
  provider: Provider,
  options: { redirectUri: string; state: string; selectAccount?: boolean },
): string {
  const url = new URL(upstream(env, ENDPOINTS[provider].authorize));
  url.searchParams.set("client_id", credentials(env, provider).id);
  url.searchParams.set("redirect_uri", options.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", ENDPOINTS[provider].scope);
  url.searchParams.set("state", options.state);
  if (options.selectAccount) url.searchParams.set("prompt", "select_account");
  return url.href;
}

export class ProviderError extends Error {}

/** Redeems the provider's code and reads who signed in. */
export async function exchangeCode(
  env: ProviderEnv,
  provider: Provider,
  code: string,
  redirectUri: string,
  fetcher: typeof fetch = fetch,
): Promise<Identity> {
  const { id, secret } = credentials(env, provider);
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: id,
    client_secret: secret,
  });
  const res = await fetcher(upstream(env, ENDPOINTS[provider].token), {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/x-www-form-urlencoded",
      "user-agent": USER_AGENT,
    },
    body,
  });
  if (!res.ok) {
    throw new ProviderError(`${provider} token endpoint: HTTP ${res.status}`);
  }
  const tokens = (await res.json()) as Record<string, unknown>;
  if (typeof tokens.error === "string") {
    throw new ProviderError(`${provider} token endpoint: ${tokens.error}`);
  }
  return provider === "github"
    ? githubIdentity(env, tokens, fetcher)
    : googleIdentity(env, tokens);
}

async function githubIdentity(
  env: ProviderEnv,
  tokens: Record<string, unknown>,
  fetcher: typeof fetch,
): Promise<Identity> {
  if (typeof tokens.access_token !== "string") {
    throw new ProviderError("github: no access_token");
  }
  const headers = {
    authorization: `Bearer ${tokens.access_token}`,
    accept: "application/vnd.github+json",
    "user-agent": USER_AGENT,
  };
  const [userRes, emailsRes] = await Promise.all([
    fetcher(upstream(env, ENDPOINTS.github.user), { headers }),
    fetcher(upstream(env, ENDPOINTS.github.emails), { headers }),
  ]);
  if (!userRes.ok)
    throw new ProviderError(`github /user: HTTP ${userRes.status}`);
  const user = (await userRes.json()) as Record<string, unknown>;
  if (typeof user.id !== "number" && typeof user.id !== "string") {
    throw new ProviderError("github /user: no id");
  }
  // /user/emails needs user:email; a user who declined it still signs in.
  const emails = emailsRes.ok
    ? ((await emailsRes.json()) as GithubEmail[])
    : [];
  const verified = emails.filter((e) => e.verified);
  const email = verified.find((e) => e.primary) ?? verified[0];
  const identity: Identity = {
    sub: `github:${user.id}`,
    provider: "github",
    provider_id: String(user.id),
    email_verified: email !== undefined,
  };
  if (email) identity.email = email.email;
  if (typeof user.name === "string" && user.name) identity.name = user.name;
  if (typeof user.avatar_url === "string") identity.picture = user.avatar_url;
  if (typeof user.login === "string") identity.preferred_username = user.login;
  return identity;
}

interface GithubEmail {
  email: string;
  primary: boolean;
  verified: boolean;
}

/**
 * Google's token response carries an id_token. It arrived over TLS straight
 * from Google, so its signature need not be checked (OIDC Core 3.1.3.7.6);
 * the issuer and audience still are.
 */
function googleIdentity(
  env: ProviderEnv,
  tokens: Record<string, unknown>,
): Identity {
  if (typeof tokens.id_token !== "string") {
    throw new ProviderError("google: no id_token");
  }
  const claims = decodeJwtPayload(tokens.id_token);
  if (
    !claims ||
    typeof claims.iss !== "string" ||
    !GOOGLE_ISSUERS.includes(claims.iss) ||
    claims.aud !== env.GOOGLE_CLIENT_ID ||
    typeof claims.sub !== "string"
  ) {
    throw new ProviderError("google: unexpected id_token");
  }
  const identity: Identity = {
    sub: `google:${claims.sub}`,
    provider: "google",
    provider_id: claims.sub,
    email_verified: claims.email_verified === true,
  };
  if (typeof claims.email === "string") identity.email = claims.email;
  if (typeof claims.name === "string" && claims.name)
    identity.name = claims.name;
  if (typeof claims.picture === "string") identity.picture = claims.picture;
  return identity;
}
