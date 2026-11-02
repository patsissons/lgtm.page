import { open, seal } from "./crypto";
import type { AuthEnv } from "./env";
import type { AuthRequest, Identity, SessionPayload } from "./types";
import { isProvider } from "./types";

export const TXN_COOKIE = "lgtm_auth_txn";
export const SESSION_COOKIE = "lgtm_auth_session";
/** How long the user may spend at the provider. */
export const TXN_TTL = 10 * 60;
/** The broker remembers a sign-in this long; not sliding. */
export const SESSION_TTL = 30 * 24 * 3600;

type Secrets = Pick<AuthEnv, "AUTH_MASTER_SECRET">;

export function sealTxn(env: Secrets, txn: AuthRequest): Promise<string> {
  return seal(env.AUTH_MASTER_SECRET, "txn", txn);
}

export async function openTxn(
  env: Secrets,
  sealed: string | undefined,
  now: number,
): Promise<AuthRequest | null> {
  const value = (await open(
    env.AUTH_MASTER_SECRET,
    "txn",
    sealed,
  )) as Partial<AuthRequest> | null;
  if (
    !value ||
    typeof value.id !== "string" ||
    typeof value.client_id !== "string" ||
    typeof value.redirect_uri !== "string" ||
    typeof value.scope !== "string" ||
    !isProvider(value.provider) ||
    typeof value.exp !== "number" ||
    value.exp <= now
  ) {
    return null;
  }
  return value as AuthRequest;
}

export function sealSession(
  env: Secrets,
  session: SessionPayload,
): Promise<string> {
  return seal(env.AUTH_MASTER_SECRET, "session", session);
}

export async function openSession(
  env: Secrets,
  sealed: string | undefined,
  now: number,
): Promise<SessionPayload | null> {
  const value = (await open(
    env.AUTH_MASTER_SECRET,
    "session",
    sealed,
  )) as Partial<SessionPayload> | null;
  if (
    !value ||
    !isIdentity(value.identity) ||
    typeof value.auth_time !== "number" ||
    typeof value.exp !== "number" ||
    value.exp <= now
  ) {
    return null;
  }
  return value as SessionPayload;
}

export function isIdentity(value: unknown): value is Identity {
  const id = value as Partial<Identity> | null;
  return (
    typeof id === "object" &&
    id !== null &&
    typeof id.sub === "string" &&
    isProvider(id.provider) &&
    typeof id.provider_id === "string" &&
    typeof id.email_verified === "boolean"
  );
}
