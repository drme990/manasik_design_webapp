<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Caching architecture

There is no IndexedDB, localStorage mirror, or offline-sync engine anywhere
in this app. MongoDB (via the Next.js API routes) is always the source of
truth.

- `lib/store/fetch-with-auth.ts` — shared authenticated `fetch` wrapper.
- `lib/store/use-project-store.ts` — **Zustand** store for projects (designs
  + booking templates). This is the single client-side source of truth for
  project data. The store state IS the cache — components subscribe to
  slices of it and get instant re-renders when data changes, with no manual
  cache invalidation needed. All mutations are optimistic: the store
  updates immediately so the UI reflects the change before the server
  confirms it. Access outside React components via
  `useProjectStore.getState()`.
- `lib/store/cache.ts` — `createResourceCache<T>(ttlMs)`, still used by
  `pdf-projects.ts`, `booking-templates.ts`, and `backend-products.ts`.
  Don't reintroduce IndexedDB, localStorage, or a bespoke cache per store.
- `lib/store/projects.ts` — **deprecated**. Replaced by
  `use-project-store.ts`. Kept as dead code; do not import from it.
- The editor page keeps in-progress edits in React state (and
  sessionStorage only for crash recovery); it writes to the DB only on
  explicit Save or the leave-modal "Yes" action.

## SSO with admin panel

The design app and admin panel share a single sign-on (SSO) session.
A user logged into either app is automatically authenticated on the
other — no separate login required.

### How it works

Both apps are on subdomains of the same root domain (e.g.
`admin.manasik.net` and `design.manasik.net`). They share:

1. **Same cookie name** — `admin_panel-token` (set by both apps)
2. **Same cookie domain** — scoped to the parent domain (`.manasik.net`)
   via the `COOKIE_DOMAIN` env var, so the browser sends it to both
   subdomains
3. **Same JWT secret** — `JWT_SECRET` env var must have the same value
   in all three apps (design app, backend, admin panel)
4. **Compatible JWT payloads** — the design app's JWT includes
   `appId: 'admin_panel'` so the backend accepts it. Both verifiers
   accept `userId`/`sub` as aliases for the user ID field.

### Env vars (all three apps must set these)

| Var | Example | Purpose |
|---|---|---|
| `JWT_SECRET` | `<same random string>` | Shared JWT signing secret |
| `COOKIE_DOMAIN` | `.manasik.net` | Parent domain for SSO cookie |

In local dev, leave `COOKIE_DOMAIN` unset — the cookie defaults to the
current host (`localhost`), which works when both apps run on different
ports of `localhost`.

### What changed

- Design app cookie renamed from `manasik_design_session` to
  `admin_panel-token` (matches the backend)
- Design app JWT payload now includes `appId: 'admin_panel'`
- Both apps' JWT verifiers accept `userId`/`sub` as aliases
- Both apps' cookie setters use `domain: COOKIE_DOMAIN` when set
- Backend `sameSite` changed from `none` to `lax` in production (works
  for subdomain SSO, more secure)

## Order design callback

The backend can trigger design generation for an order by calling
`POST /api/orders/generate-design` on this app. The route is
authenticated via a shared secret sent in the `x-callback-secret`
header.

Env vars (design app):
- `CALLBACK_SECRET` — shared secret. Must match
  `DESIGN_APP_CALLBACK_SECRET` on the backend. If unset, the route
  refuses all requests (fail-closed).

Env vars (backend):
- `DESIGN_APP_URL` — base URL of this app (e.g.
  `https://design.manasik.net`).
- `DESIGN_APP_CALLBACK_SECRET` — same value as `CALLBACK_SECRET` above.

The backend loops over each product in the order and sends one request
per product. Products without a template are reported back as
`noTemplate` and skipped — the backend continues with the next product.

Each booking product can have two template slots:
- `templateId` — the text (no-image) template, used when the order has
  no reservation photo.
- `imageTemplateId` — the image template, used when the order has a
  reservation photo. Falls back to `templateId` if not set.

Generated designs are uploaded to R2 at:
- `design/orders-design/{orderNumber}.jpg` for single-item orders
- `design/orders-design/{orderNumber}-1.jpg`, `{orderNumber}-2.jpg`, ...
  for multi-item orders (1-based item index)

The URL is stored on the order's `designUrls` array on the backend.

## Design instances vs templates

When a design is generated for an order, the design app creates a
**design instance** — a standalone `kind: 'design'` project that's a
copy of the template with all dynamic field layers inflated with the
order's actual data (customer name, reservation photo, etc.).

The design instance is:
1. Saved to MongoDB as a separate project
2. Rendered to JPG via puppeteer
3. Uploaded to R2
4. Its project ID is stored on the order's `designUrls[].projectId`

When the admin clicks "edit design" in the admin panel, the editor
opens the **design instance** (`/editor/{projectId}`), not the template.
Editing the design instance doesn't affect the template or future
orders — the admin is editing THIS specific order's design.

The template only changes when the user explicitly goes to the
templates section in the design app and edits it there.

`lib/render/inflate-template.ts` handles the template → design instance
conversion:
- Dynamic text fields → concrete text layers with resolved values
- Dynamic image fields → concrete image layers with resolved URLs
- All other layers pass through unchanged
- The instance is marked `source: 'order'` and stores the R2 URL in
  `orderDesignUrl`

### Order designs section

Order-generated designs (`source: 'order'`) are hidden from the main
`/projects` list and shown in a separate `/orders-designs` section in
the design app. This keeps user-created designs separate from
auto-generated order designs.

The API filters by `source`:
- `GET /api/projects` — excludes `source: 'order'` by default
- `GET /api/projects?source=order` — returns only order designs

### Re-render on save

When the admin edits an order design in the editor and saves, the
store's `saveProject` automatically calls
`POST /api/projects/[id]/re-render` in the background (fire-and-forget).
This endpoint:
1. Re-renders the project to JPG via puppeteer
2. Uploads it to R2 at the **same key** (extracted from
   `project.orderDesignUrl`), overwriting the old image
3. The URL stays the same — the backend's order doesn't need updating

This means the admin panel always shows the latest version of the
design without any additional sync between the design app and backend.

### Cache-busting for order designs

Since order designs are overwritten at the same R2 key, the Cloudflare
CDN and browser cache can serve stale versions. Two mitigations:

1. **R2 upload uses `Cache-Control: no-cache`** — order design uploads
   (both initial generation and re-render) set `no-cache` so the CDN
   always revalidates with the origin. Other uploads (thumbnails, user
   images, fonts) use the default long-lived immutable cache.

2. **Admin panel appends `?v=timestamp`** — the `DesignPreviewModal`
   and `handleDownloadDesign` append a cache-busting query param every
   time the design is displayed or downloaded, forcing a fresh fetch
   that bypasses both the browser cache and the CDN edge cache.

## Template rendering pipeline

`lib/render/template-renderer.ts` is the server-side renderer. It:

1. Builds a self-contained HTML document from the template's layers,
   inflating dynamic field layers with order data (resolving
   `billing.*`, `order.*`, `item.*`, `reservation.*` variable IDs).
2. Loads Expo Arabic fonts from `public/fonts/ExpoArabic/` as base64
   data URIs, and Tajawal + IBM Plex Sans Arabic from Google Fonts CDN.
3. Uses **puppeteer-core** (headless Chromium) to render the HTML and
   screenshot the canvas element as a JPEG buffer.

### Vercel compatibility

Vercel serverless functions don't have Chrome installed, and
`puppeteer`'s bundled Chromium (~170MB) exceeds Vercel's function size
limit. The renderer uses:

- **`puppeteer-core`** (no bundled browser — smaller deploy)
- **`@sparticuz/chromium`** — provides a Lambda-compatible Chrome binary
  on Vercel serverless functions

The renderer detects the environment:
- **Vercel** (`VERCEL=1` or `AWS_REGION` set): uses
  `@sparticuz/chromium.executablePath()` + recommended Lambda args
- **Local dev**: uses `PUPPETEER_EXECUTABLE_PATH` env var, or auto-detects
  Chrome from common install locations (macOS/Windows/Linux)

`next.config.ts` adds `@sparticuz/chromium` and `puppeteer-core` to
`serverExternalPackages` so Vercel doesn't try to bundle them.

Routes that use Puppeteer export `maxDuration = 60` (seconds) since
rendering can take longer than Vercel's default 10s timeout.

Dependencies: `puppeteer-core` + `@sparticuz/chromium`. Run
`npm install` after pulling. For local dev, either install Chrome
or set `PUPPETEER_EXECUTABLE_PATH` to your Chrome binary path.

Known limitations:
- Collage image layers render only the first cell's image (full grid
  layout not yet supported server-side).
- Dynamic field text auto-shrink (binary search font fitting) is not
  reproduced — the font size is used as-is. If text overflows the box,
  it will be clipped by `overflow: hidden`.

## Follow-up needed after this refactor

`npm install` could not be run in this sandbox (the shell tool crashed with
an `Internal CLR error` on every invocation). `package.json` had the now-
unused `idb` dependency removed, but `package-lock.json` and `node_modules`
still reference it. Run `npm install` locally to sync the lockfile, then
run `npm run build` / `npm run lint` to verify the refactor end-to-end.

**Puppeteer → puppeteer-core migration:** `puppeteer` was replaced with
`puppeteer-core` + `@sparticuz/chromium` for Vercel compatibility. Run:
```
npm install
npm uninstall puppeteer
```
This removes the bundled Chromium (~170MB) and installs the Lambda-
compatible `@sparticuz/chromium` instead. For local dev, set
`PUPPETEER_EXECUTABLE_PATH` to your Chrome path if auto-detection fails.
