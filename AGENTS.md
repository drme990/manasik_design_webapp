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
2. Rendered to JPG via @napi-rs/canvas (native canvas engine)
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
1. Re-renders the project to JPG via @napi-rs/canvas
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

`lib/render/canvas-renderer.ts` is the server-side renderer. It uses
**`@napi-rs/canvas`** — a native Rust-based canvas engine that runs in
Node.js without a browser. This works on Vercel serverless functions
out of the box (no Chrome, no Puppeteer, no external services).

The renderer:

1. Registers Expo Arabic fonts from `public/fonts/ExpoArabic/` with
   the canvas engine (Tajawal + IBM Plex Sans Arabic are also
   registered if their .ttf files are in `public/fonts/google/`).
2. Creates a canvas at the project's `canvasWidth` × `canvasHeight`.
3. Draws the background (image or solid color).
4. Iterates layers sorted by `zIndex`, applying each layer's transform
   (position + rotation + opacity), then dispatches to the right
   renderer based on layer type:
   - **text** — wraps text to `boxWidth`, aligns horizontally +
     vertically, supports bold/italic/lineHeight/RTL direction
   - **image** — draws with crop, scale, offset, flip, border radius,
     border. Collage layers use a simplified grid layout.
   - **shape** — rectangle (with corner radius), circle/ellipse,
     triangle, line, stars (4/5/6/8 points), PNG shapes
   - **dynamic_field** — resolves `billing.*`, `order.*`, `item.*`,
     `reservation.*` variable IDs against the order data, then renders
     as text (auto-shrunk to fit via binary search) or image
5. Exports the canvas as a JPEG buffer (quality 95).

### Why not Puppeteer?

Previous attempts used Puppeteer (headless Chrome) to render HTML +
CSS to a screenshot. This doesn't work on Vercel serverless because:
- `puppeteer`'s bundled Chromium (~170MB) exceeds the function size limit
- `@sparticuz/chromium` needs system libraries (libnss3, etc.) that
  Vercel's runtime doesn't include
- Connecting to a remote Chrome via WebSocket (browserless.io) adds an
  external dependency + cost

`@napi-rs/canvas` ships pre-built native binaries for all major
platforms (including Vercel's AWS Lambda runtime) and renders directly
in Node.js — no browser needed.

`next.config.ts` adds `@napi-rs/canvas` to `serverExternalPackages`
so Vercel doesn't try to bundle the native module.

Dependencies: `@napi-rs/canvas` only. Run `npm install` after pulling.
No environment variables required for rendering.

Known limitations:
- Collage layers use a simplified grid layout (1 col for 1-2 cells,
  2 cols for 3+). The exact editor layout (with custom cell positions)
  is not yet reproduced server-side.
- Text auto-shrink for regular text layers (binary search font fitting
  to fit a fixed box) is not implemented — only dynamic field text
  auto-shrinks. Regular text uses the saved fontSize and wraps to
  `boxWidth` if set.
- Arabic text shaping depends on the registered fonts. If a font file
  is missing, text may render with the default system font.

## Follow-up needed after this refactor

`npm install` could not be run in this sandbox (the shell tool crashed with
an `Internal CLR error` on every invocation). Run these locally:

```
npm install
npm uninstall puppeteer puppeteer-core @sparticuz/chromium
```

This installs `@napi-rs/canvas` and removes the unused Puppeteer
packages. The old `lib/render/template-renderer.ts` file is no longer
imported — you can delete it manually.

**For Vercel deployment:** no special environment variables needed.
The renderer works out of the box with `@napi-rs/canvas`.
