export type Provider = "github" | "google";

export const PROVIDERS: readonly Provider[] = ["github", "google"];

export function isProvider(value: unknown): value is Provider {
  return value === "github" || value === "google";
}

/** Who signed in, as the provider reported it. `sub` is `<provider>:<id>`. */
export interface Identity {
  sub: string;
  provider: Provider;
  provider_id: string;
  email?: string;
  email_verified: boolean;
  name?: string;
  picture?: string;
  preferred_username?: string;
}

/** Where the broker is served from; every URL it emits derives from `issuer`. */
export interface Mount {
  /** `https://auth.lgtm.page`, or `http://localhost:5173/auth` in dev. */
  issuer: string;
  /** "" on the auth host, "/auth" when path-mounted. */
  prefix: string;
}

export type Prompt = "none" | "login" | "select_account";

/** The pending request, sealed in a cookie while the user is at the provider. */
export interface AuthRequest {
  id: string;
  client_id: string;
  redirect_uri: string;
  state?: string;
  nonce?: string;
  scope: string;
  code_challenge?: string;
  provider: Provider;
  exp: number;
}

/** What an authorization code unseals to. */
export interface CodePayload {
  jti: string;
  client_id: string;
  redirect_uri: string;
  code_challenge?: string;
  nonce?: string;
  scope: string;
  identity: Identity;
  auth_time: number;
  exp: number;
}

/** The broker's own session: who the browser last signed in as. */
export interface SessionPayload {
  identity: Identity;
  auth_time: number;
  exp: number;
}
