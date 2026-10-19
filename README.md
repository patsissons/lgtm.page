# lgtm.page

LGTM: an index of vibe-coded web apps, served at <https://lgtm.page>. The
apps live on `lgtm.page` subdomains or their own domains. Looks good to me.
Each app is a card that shows the app's own Open Graph image, title and
description.

## How it works

- `shared/apps.ts` is the registry: one entry per app, alphabetical by slug
  (the display order). Apps can live on any domain; a card links straight to
  its app.
- The Worker's `GET /api/apps` (`worker/api.ts`) fetches each app's home page,
  reads its link-preview tags (`worker/meta.ts`: `og:*`, then `twitter:*`,
  then `<title>` / `meta[name=description]`, plus `theme-color` and the
  favicon; tags in `<head>` win, but tags streamed into `<body>`, as Next.js
  does, are read too) and returns one card per app. An app that cannot be fetched still
  gets a card, flagged as unreachable.
- The card list is cached at the edge (Workers Cache API). It is fresh for an
  hour (a minute if any app failed); after that the stale list is served
  while a new one is fetched in the background. Both the edge cache and the
  browser's copy are keyed on a fingerprint of the registry
  (`appsVersion`), so a deploy that adds, removes or edits an app is seen
  everywhere on the next page load. `GET /api/apps?refresh` skips the cache
  and repopulates it (in the one data center that answers it).
- The React app (`src/`) renders the cards in a responsive grid. Card images
  are loaded straight from each app; a missing or broken image falls back to
  a gradient in the app's theme colour.
- Light and dark themes follow the system setting until the visitor uses
  the toggle in the header; the choice is remembered on that device.
- `www.lgtm.page` permanently redirects to `lgtm.page`.

## Adding an app

1. Make sure the app's HTML has absolute Open Graph tags (`og:title`,
   `og:description`, `og:image` at 1200×630, ideally `og:image:alt`) and a
   `theme-color`.
2. Add one entry to `shared/apps.ts`, keeping the list alphabetical by slug:

   ```ts
   { slug: "myapp", url: "https://myapp.example/", repo: "https://github.com/…" },
   ```

   `title`, `description` and `image` can override poor tags.

3. Deploy. The new card shows up on the next page load.

Changes to an app's own tags show up within the hour without redeploying
the index; open <https://lgtm.page/api/apps?refresh> to pick them up sooner
in your nearest data center.

## Stack

- React 19, Vite, Tailwind v4, shadcn/ui
- One Cloudflare Worker serving the SPA as static assets and the `/api`
  routes
- Vitest (unit), Playwright (e2e on desktop Chrome and mobile Safari),
  ESLint, Prettier

## Setup

```sh
pnpm install
pnpm exec playwright install webkit chromium
pnpm dev
```

`pnpm dev` runs Vite with the Cloudflare plugin, so the Worker runs locally
in workerd and `/api/apps` fetches the live apps.

## Scripts

| Script                     | What it does                                                     |
| -------------------------- | ---------------------------------------------------------------- |
| `pnpm dev`                 | Vite dev server with the Worker running locally                  |
| `pnpm build`               | Production build of the client and the Worker                    |
| `pnpm preview`             | Serve the production build locally                               |
| `pnpm deploy`              | Build and `wrangler deploy`                                      |
| `pnpm og`                  | Regenerate `public/og.png` and `public/apple-touch-icon.png`     |
| `pnpm types`               | Regenerate `worker-configuration.d.ts` from `wrangler.jsonc`     |
| `pnpm typecheck`           | `wrangler types`, then `tsc -b` over the app, worker and tooling |
| `pnpm test`                | Unit tests (Vitest)                                              |
| `pnpm test:watch`          | Unit tests in watch mode                                         |
| `pnpm test:e2e`            | Playwright e2e tests (starts its own dev server on port 5198)    |
| `pnpm lint`                | ESLint                                                           |
| `pnpm format`              | Prettier (write)                                                 |
| `pnpm format:check`        | Prettier (check)                                                 |
| `pnpm validate:quick`      | Format check, typecheck, lint and unit tests                     |
| `pnpm validate`            | `validate:quick`, then the e2e suite (used by CI)                |
| `pnpm format-and-validate` | `format`, then `validate` (run before every commit)              |

## Deploy

```sh
pnpm deploy
```

Requires `wrangler login` (or `CLOUDFLARE_API_TOKEN`, e.g. in a gitignored
`.env`). Production is served at <https://lgtm.page> and
<https://www.lgtm.page> (custom domains in `wrangler.jsonc` `routes`, the
latter redirecting to the former), with a `workers.dev` fallback.

CI (`.github/workflows/ci.yml`) validates every PR and deploys `main`; it
needs the `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` repository
secrets. Every PR also gets a preview (`.github/workflows/preview.yml`) at
`https://pr-<N>-lgtm.<subdomain>.workers.dev`, posted as a PR comment and
deleted when the PR is closed.
