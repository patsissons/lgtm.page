import { UserRound, X } from "lucide-react";
import { useEffect, useState, type SVGProps } from "react";
import { GitHubIcon } from "@/components/github-icon";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useUser, type User } from "@/lib/use-user";

const ROUND_BUTTON =
  "inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full border bg-card text-muted-foreground transition hover:border-primary/50 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";
const PROVIDER_BUTTON =
  "flex w-full cursor-pointer items-center justify-center gap-2.5 rounded-lg border px-4 py-2.5 text-sm font-medium transition hover:border-primary/50 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

const ERROR_PARAM = "auth_error";

/** Human text for the `?auth_error=` the callback redirects with. */
const ERROR_TEXT: Record<string, string> = {
  access_denied: "Sign-in was cancelled.",
  login_required: "Please sign in again.",
};

function describeError(code: string): string {
  return ERROR_TEXT[code] ?? `Sign-in failed (${code}). Please try again.`;
}

/** Reads and strips `?auth_error=` once, so a reload does not repeat it. */
function useAuthError(): [string | null, () => void] {
  const [error, setError] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return new URLSearchParams(window.location.search).get(ERROR_PARAM);
  });
  useEffect(() => {
    if (error === null) return;
    const url = new URL(window.location.href);
    if (!url.searchParams.has(ERROR_PARAM)) return;
    url.searchParams.delete(ERROR_PARAM);
    window.history.replaceState(window.history.state, "", url);
  }, [error]);
  return [error, () => setError(null)];
}

/** Google's "G" (lucide-react has no brand icons). */
function GoogleIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden {...props}>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1A6.97 6.97 0 0 1 5.47 12c0-.73.13-1.44.37-2.1V7.06H2.18A11 11 0 0 0 1 12c0 1.78.43 3.45 1.18 4.94l3.66-2.84Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52Z"
      />
    </svg>
  );
}

function initials(user: User): string {
  const source = user.name ?? user.preferredUsername ?? user.email ?? "?";
  const parts = source.trim().split(/\s+/).filter(Boolean);
  const letters =
    parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : source[0];
  return letters.toUpperCase();
}

function ErrorNotice({
  error,
  onDismiss,
}: {
  error: string;
  onDismiss: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex items-start justify-between gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-foreground"
    >
      <span>{describeError(error)}</span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="cursor-pointer rounded text-muted-foreground hover:text-foreground"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}

/**
 * The header's avatar: a sign-in dialog when signed out (GitHub or Google
 * through auth.lgtm.page), the account and a sign-out when signed in. Sign-in
 * and sign-out are full-page navigations handled by /api/auth/*.
 */
export function AccountMenu() {
  const user = useUser();
  const [error, dismissError] = useAuthError();
  const [open, setOpen] = useState(error !== null);

  if (user.status === "loading") {
    return (
      <span
        aria-hidden
        className="inline-flex size-11 shrink-0 animate-pulse rounded-full border bg-card"
      />
    );
  }

  if (user.status === "signed-out") {
    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger
          className={ROUND_BUTTON}
          aria-label="Sign in"
          title="Sign in"
        >
          <UserRound className="size-5" />
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sign in to lgtm.page</DialogTitle>
            <DialogDescription>
              One sign-in for lgtm.page and every app listed here.
            </DialogDescription>
          </DialogHeader>
          {error && <ErrorNotice error={error} onDismiss={dismissError} />}
          <div className="flex flex-col gap-2">
            <a
              href="/api/auth/login?provider=github"
              className={PROVIDER_BUTTON}
            >
              <GitHubIcon className="size-4" />
              Continue with GitHub
            </a>
            <a
              href="/api/auth/login?provider=google"
              className={PROVIDER_BUTTON}
            >
              <GoogleIcon className="size-4" />
              Continue with Google
            </a>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const { user: account } = user;
  const label = account.name ?? account.preferredUsername ?? account.email;
  const detail =
    account.email ??
    (account.preferredUsername ? `@${account.preferredUsername}` : undefined);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        className={ROUND_BUTTON}
        aria-label="Account"
        title={label}
      >
        <Avatar className="size-9">
          {account.picture && <AvatarImage src={account.picture} alt="" />}
          <AvatarFallback>{initials(account)}</AvatarFallback>
        </Avatar>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Account</DialogTitle>
          <DialogDescription>
            Signed in with {account.provider === "github" ? "GitHub" : "Google"}
            .
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-3">
          <Avatar size="lg">
            {account.picture && <AvatarImage src={account.picture} alt="" />}
            <AvatarFallback>{initials(account)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground">{label}</p>
            {detail && detail !== label && (
              <p className="truncate text-muted-foreground">{detail}</p>
            )}
          </div>
        </div>
        <form method="post" action="/api/auth/logout">
          <button type="submit" className={PROVIDER_BUTTON}>
            Sign out
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
