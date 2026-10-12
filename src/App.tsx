import { CircleCheck } from "lucide-react";
import { AppCard, AppCardSkeleton } from "@/components/app-card";
import { useApps } from "@/lib/use-apps";

const GRID = "grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3";

export default function App() {
  const apps = useApps();

  return (
    <div className="safe-x mx-auto flex min-h-dvh max-w-6xl flex-col py-12 sm:py-16">
      <header className="mb-10 sm:mb-14">
        <h1 className="flex items-center gap-3 text-4xl font-bold tracking-tight sm:text-5xl">
          <CircleCheck
            aria-hidden
            className="size-9 text-primary sm:size-11"
            strokeWidth={2.5}
          />
          lgtm.page
        </h1>
        <p className="mt-3 max-w-xl text-lg text-muted-foreground">
          Small web apps that looked good to me. Each one lives on its own
          subdomain.
        </p>
      </header>

      <main className="flex-1">
        {apps.status === "loading" && (
          <div className={GRID} aria-busy="true" aria-label="Loading apps">
            {Array.from({ length: 3 }, (_, i) => (
              <AppCardSkeleton key={i} />
            ))}
          </div>
        )}
        {apps.status === "error" && (
          <div role="alert" className="rounded-xl border bg-card p-6">
            <p>Couldn't load the apps.</p>
            <button
              type="button"
              onClick={apps.retry}
              className="mt-3 cursor-pointer rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Try again
            </button>
          </div>
        )}
        {apps.status === "ready" && (
          <ul className={GRID} aria-label="Apps">
            {apps.apps.map((app) => (
              <li key={app.slug} className="flex">
                <AppCard app={app} />
              </li>
            ))}
          </ul>
        )}
      </main>

      <footer className="mt-16 text-sm text-muted-foreground">
        <a
          href="https://github.com/patsissons/lgtm.page"
          className="hover:text-foreground"
        >
          Source on GitHub
        </a>
      </footer>
    </div>
  );
}
