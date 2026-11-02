import { useCallback, useEffect, useState } from "react";

/** What /api/auth/me reports about the signed-in visitor. */
export interface User {
  sub: string;
  provider: "github" | "google";
  name?: string;
  email?: string;
  picture?: string;
  preferredUsername?: string;
}

export type UserState =
  | { status: "loading" }
  | { status: "signed-out" }
  | { status: "signed-in"; user: User };

/** The index's own session (the `lgtm_session` cookie), via /api/auth/me. */
export function useUser(): UserState & { refresh: () => void } {
  const [state, setState] = useState<UserState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/auth/me", {
      signal: controller.signal,
      credentials: "same-origin",
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<{ user: User | null }>;
      })
      .then(({ user }) =>
        setState(
          user ? { status: "signed-in", user } : { status: "signed-out" },
        ),
      )
      .catch(() => {
        // Not knowing is the same as signed out for the UI.
        if (!controller.signal.aborted) setState({ status: "signed-out" });
      });
    return () => controller.abort();
  }, [attempt]);

  const refresh = useCallback(() => setAttempt((n) => n + 1), []);
  return { ...state, refresh };
}
