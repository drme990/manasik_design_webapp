<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Database indexes

The `projects` collection can grow large (every order generates a design
instance). Without indexes, MongoDB's in-memory sort hits its 32MB limit
and returns: `Sort exceeded memory limit of 33554432 bytes, but did not
opt in to external sorting.`

**Always use `.allowDiskUse(true)` on any `.find().sort()` query** — this
opts into external (disk-based) sorting as a safety net even without
indexes.

**Index setup script**: `npm run setup-indexes` (runs
`scripts/setup-indexes.ts`). Creates all necessary indexes on all
collections. Idempotent — safe to run multiple times. Run this once after
deploying to a new environment.

Key indexes on `projects`:
- `id` (unique) — every `findOne({ id })` lookup
- `userId + updatedAt` — GET /api/projects (user's designs)
- `source + kind + updatedAt` — GET /api/projects?source=order
- `kind + updatedAt` — GET /api/projects?kind=booking_template

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

Each booking product represents a (backend product, size) pair and has
four template slots (2 types × 2 apps). Products with multiple sizes
have one booking product per size, so the admin can connect each size
to a different template. The unique key is `(backendProductId, sizeIndex)`.
- `templateId` — Manasik text (no-image) template, used when
  `order.source='manasik'` and the order has no reservation photo.
- `imageTemplateId` — Manasik image template, used when
  `order.source='manasik'` and the order has a reservation photo.
- `ghadaqTemplateId` — Ghadaq text template, used when
  `order.source='ghadaq'` and the order has no reservation photo.
- `ghadaqImageTemplateId` — Ghadaq image template, used when
  `order.source='ghadaq'` and the order has a reservation photo.

**One per slot — no duplicates.** Each product can have at most ONE
template per slot. A product cannot have two templates in the same
slot. This is enforced both client-side (the `ConnectProductsModal`
disables the toggle button if the product already has a different
template in the same slot) and server-side (the
`PATCH /api/booking-products/[id]` route validates that the template's
`templateType` and `appSource` match the slot's expected type+app,
returning `templateTypeMismatch` or `appSourceMismatch` if they don't).

**Product assignment UI.** Connecting products to templates is done via
the `ConnectProductsModal` (`components/templates/ConnectProductsModal.tsx`)
opened from the `/templates` list page — not a separate page. The modal
shows the template preview, a type badge (text/image), a search box, and
a grid of backend products with checkboxes. Changes are staged locally
and only persisted when the Save button is clicked (batched in parallel).
The old `/templates/[productId]` route redirects to `/templates`.

**Strict matching — no fallback.** The design app picks the template
slot based on `orderData.source` (manasik/ghadaq) AND
`hasReservationPhoto` (true/false). If the required slot is empty, the
request fails with `noTemplate`. The design app never falls back to a
different type or a different app — a ghadaq order uses ghadaq templates
only, and an order with a photo uses an image template only. This
ensures the right template variant is always used for the right order.

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
opens the **design instance** (`/editor/d/{projectId}`), not the template.
Editing the design instance doesn't affect the template or future
orders — the admin is editing THIS specific order's design.

The template only changes when the user explicitly goes to the
templates section in the design app and edits it there.

### Editor routes

The editor is split into two routes by project kind:
- `/editor/t/[id]` — template editor (`kind: 'booking_template'`). Shows
  the "Add Field" button and filters dynamic fields by `templateType`.
  Redirects to `/editor/d/` if the project is not a template.
- `/editor/d/[id]` — design editor (`kind: 'design'`). Used for both
  user-created designs and order-generated designs. No "Add Field"
  button (dynamic fields are only for templates). Redirects to
  `/editor/t/` if the project is a booking template.
- `/editor/[id]` — legacy route, auto-redirects to `/editor/t/` or
  `/editor/d/` based on project kind. Kept for backwards compatibility.

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
   `project.orderDesignUrl`), overwriting the old image.
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
     border. Collage layers use the same `COLLAGE_LAYOUTS` definitions
     as the editor (proper cell positions per layout).
   - **shape** — rectangle (with corner radius), circle/ellipse,
     triangle, line, stars (4/5/6/8 points), PNG shapes
   - **dynamic_field** — resolves `billing.*`, `order.*`, `item.*`,
     `reservation.*`, `ref.*`, `custom.*` variable IDs against the order
     data, then renders as text (auto-fits to fill the box) or image.
     Fields are grouped in the picker UI by category:
     - **Order fields** (`order` category): billing, order-level, item
       fields — direct data from the order.
     - **Reservation fields** (`reservation` category): intention,
       sacrificeFor, gender, isAlive, shortDuaa, photo, executionDate.
     - **Custom fields** (`custom` category): derived/computed fields:
       - `ref.phoneNumbers` — multi-line list of all referral phone
         numbers (from the `referrals` collection), with the order's ref
         first. Default refs (MNK-D, GHD-D) map to m1. Each number on its
         own row.
       - `custom.genderLetter` — gender as a single letter: "M" (male),
         "F" (female), "M,F" (both). Reads `reservation.gender` from
         the DB (stored in Arabic: "ذكر", "انثى", "ذكور و اناث") and
         converts to the letter representation.
       - `custom.genderIcon` — gender as a Unicode symbol: "♂" (male),
         "♀" (female), "♂♀" (both). Same source as genderLetter.
     - **Missing data → hidden** — if a field resolves to no value
       (undefined, null, empty string, whitespace-only, or the literal
       strings "none"/"null"/"undefined"), the field is NOT displayed.
       The placeholder text is never shown on generated designs — only
       fields with real data appear. The layer is set to
       `visible: false` (inflate) or skipped entirely (render).
     - **Display rules** — some fields are conditionally hidden via
       `shouldDisplayField()` even when they have a value:
       - `item.quantity` — only shown when quantity >= 2. A single item
         is the default, so showing "1" is redundant. The layer is set
         to `visible: false` (inflate) or skipped entirely (render).
     - **Formatting rules** — some fields have their values formatted
       before display:
       - `reservation.sacrificeFor` (اسم الشخص المؤدى عنه) — the backend
         stores multiple names as a newline-separated string. Each name
         goes on its own line with "و" (Arabic "and") prepended to every
         name after the first. Single name → no prefix.
         e.g. `"أحمد\nمحمد\nعلي"` → `"أحمد\nو محمد\nو علي"`.
5. Exports the canvas as a JPEG buffer (quality 100 = max on
   @napi-rs/canvas's 0-100 scale — NOT 0-1 like browser canvas).

### Render quality

The renderer uses 3x supersampling for sharp output:
- Canvas is created at 3× the project's logical dimensions
- Context is scaled by 3× so drawing code uses logical coordinates
- For a 1080×1080 template, the output is 3240×3240 pixels
- `textRendering: 'optimizeLegibility'` for crisp Arabic text
- `imageSmoothingQuality: 'high'` for smooth photo scaling
- JPEG quality 100 (@napi-rs/canvas uses 0-100 scale, not 0-1)

### Fonts

Registered fonts (from `public/fonts/`):
- **Expo Arabic** — primary Arabic design font (5 weights)
- **Satoshi** — Latin/UI font (7 variants including italics)
- **Tajawal** + **IBM Plex Sans Arabic** — Google Fonts, must be
  downloaded manually to `public/fonts/google/` (see renderer code
  for download links). If missing, text falls back to Expo Arabic.

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

### Image loading on Vercel production

On Vercel serverless, `fetch()` to the R2 public URL
(`storage.manasik.net`) may fail — Cloudflare CDN can block or 404
server-side requests. The renderer handles this with a two-strategy
fallback in `loadImageFromUrl`:

1. **HTTP fetch** to the public CDN URL (works locally + on most hosts)
2. **R2 S3 API** direct download via `downloadFromR2()` — bypasses
   Cloudflare CDN entirely, going to `{accountId}.r2.cloudflarestorage.com`
   using the R2 credentials. Used when HTTP fetch fails on Vercel.

The S3 client is configured with `forcePathStyle: true` and
`requestChecksumCalculation: 'WHEN_REQUIRED'` to match the backend's
configuration. The same fallback is used in the image-proxy and
proxy-image routes.

Known limitations:
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
