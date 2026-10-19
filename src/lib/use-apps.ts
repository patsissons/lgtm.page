import { useCallback, useEffect, useState } from "react";
import { appsVersion } from "@shared/apps";
import type { AppCard } from "@shared/types";

export type AppsState =
  | { status: "loading" }
  | { status: "ready"; apps: AppCard[] }
  | { status: "error" };

/**
 * The card list from the Worker (/api/apps), with a retry for failures. The
 * URL carries the registry version so a deploy that changes the registry
 * skips the browser's cached copy.
 */
export function useApps(): AppsState & { retry: () => void } {
  const [state, setState] = useState<AppsState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/apps?v=${appsVersion}`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<AppCard[]>;
      })
      .then((apps) => setState({ status: "ready", apps }))
      .catch(() => {
        if (!controller.signal.aborted) setState({ status: "error" });
      });
    return () => controller.abort();
  }, [attempt]);

  const retry = useCallback(() => {
    setState({ status: "loading" });
    setAttempt((n) => n + 1);
  }, []);

  return { ...state, retry };
}
