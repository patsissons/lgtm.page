import { useState, type CSSProperties } from "react";
import { GitHubIcon } from "@/components/github-icon";
import type { AppCard as AppCardData } from "@shared/types";
import { cn } from "@/lib/utils";

/**
 * One app: its Open Graph image, title and description. The title link is
 * stretched over the whole card, so the repo link can sit on top of it
 * without nesting anchors.
 */
export function AppCard({ app }: { app: AppCardData }) {
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = app.image && !imageFailed;

  return (
    <article
      data-testid="app-card"
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-xl border bg-card text-card-foreground",
        "transition duration-200 hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-xl hover:shadow-black/30",
        "focus-within:border-primary/50",
      )}
    >
      <div className="relative aspect-[1200/630] overflow-hidden border-b bg-muted">
        {showImage ? (
          <img
            src={app.image}
            alt={app.imageAlt ?? ""}
            loading="lazy"
            decoding="async"
            onError={() => setImageFailed(true)}
            className="size-full object-cover transition duration-300 group-hover:scale-[1.02]"
          />
        ) : (
          <div
            data-testid="app-card-placeholder"
            className="flex size-full items-center justify-center p-6"
            style={placeholderStyle(app.themeColor)}
          >
            <span className="text-center text-3xl font-bold tracking-tight text-foreground/90">
              {app.title}
            </span>
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <h2 className="text-lg font-semibold tracking-tight">
          <a
            href={app.url}
            className="outline-none after:absolute after:inset-0 after:content-['']"
          >
            {app.title}
          </a>
        </h2>
        {app.description && (
          <p className="line-clamp-3 text-sm text-muted-foreground">
            {app.description}
          </p>
        )}
        <div className="mt-auto flex items-center gap-2 pt-2 text-xs text-muted-foreground">
          {app.icon && (
            <img src={app.icon} alt="" className="size-4 rounded-sm" />
          )}
          <span className="truncate">{app.host}</span>
          {app.status === "error" && (
            <span className="text-destructive">· unreachable</span>
          )}
          {app.repo && (
            <a
              href={app.repo}
              aria-label={`${app.title} source code`}
              className="relative z-10 ml-auto rounded-md p-1 transition hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              <GitHubIcon className="size-4" />
            </a>
          )}
        </div>
      </div>
    </article>
  );
}

export function AppCardSkeleton() {
  return (
    <div
      data-testid="app-card-skeleton"
      aria-hidden
      className="flex animate-pulse flex-col overflow-hidden rounded-xl border bg-card"
    >
      <div className="aspect-[1200/630] bg-muted" />
      <div className="flex flex-col gap-3 p-4">
        <div className="h-5 w-1/3 rounded bg-muted" />
        <div className="h-3 w-full rounded bg-muted" />
        <div className="h-3 w-2/3 rounded bg-muted" />
      </div>
    </div>
  );
}

/** A gradient from the app's theme colour, when it is a valid CSS colour. */
function placeholderStyle(themeColor?: string): CSSProperties {
  const color =
    themeColor && globalThis.CSS?.supports?.("color", themeColor)
      ? themeColor
      : "var(--secondary)";
  return {
    background: `radial-gradient(circle at 30% 20%, color-mix(in oklch, ${color} 70%, white 10%), var(--card))`,
  };
}
