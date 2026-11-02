/**
 * Prints the client secret the broker expects from a confidential client
 * (one that cannot do PKCE, such as PocketBase). It is derived from the
 * broker's master secret and the app's registry slug, so there is nothing to
 * store: run this with the *production* `AUTH_MASTER_SECRET` to configure a
 * live app, or the one from `.dev.vars` for local dev.
 *
 *   AUTH_MASTER_SECRET=… pnpm auth:client-secret voting
 */
import { deriveClientSecret } from "../../shared/auth.ts";

const [slug] = process.argv.slice(2);
const master = process.env.AUTH_MASTER_SECRET;
if (!slug || !master) {
  console.error(
    "usage: AUTH_MASTER_SECRET=<secret> pnpm auth:client-secret <registry slug>",
  );
  process.exit(1);
}

process.stdout.write((await deriveClientSecret(master, slug)) + "\n");
