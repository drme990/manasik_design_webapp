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

## Template rendering pipeline

`lib/render/template-renderer.ts` is the server-side renderer. It:

1. Builds a self-contained HTML document from the template's layers,
   inflating dynamic field layers with order data (resolving
   `billing.*`, `order.*`, `item.*`, `reservation.*` variable IDs).
2. Loads Expo Arabic fonts from `public/fonts/ExpoArabic/` as base64
   data URIs, and Tajawal + IBM Plex Sans Arabic from Google Fonts CDN.
3. Uses **puppeteer** (headless Chromium) to render the HTML and
   screenshot the canvas element as a JPEG buffer.

Dependencies: `puppeteer` (added to package.json). Run `npm install`
after pulling. Puppeteer downloads its own Chromium on install.

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
