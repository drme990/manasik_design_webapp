# Manasik Design Webapp — Features

## Authentication & Access Control

- Email/password login with JWT session cookies
- Route protection — `(design)` layout verifies session server-side, redirects to `/login` if unauthenticated
- Role-based access (admin / super_admin) for template and booking product management
- Multi-user support — each user sees only their own projects
- **Single Sign-On (SSO)** with the admin panel — shared JWT cookie:
  - Both apps use the same `users_admin_panel` MongoDB collection
  - Cookie name `admin_panel-token` is shared across subdomains via `COOKIE_DOMAIN`
  - JWT payload includes `appId: 'admin_panel'` so each app can read the other's tokens
  - `verifyJWT` accepts `userId` as an alias for `sub` (and vice versa) for cross-app token compatibility
  - Cookie `sameSite: 'lax'` in production, `domain: COOKIE_DOMAIN` when set
  - Admins logged into the admin panel are automatically authenticated in the design app (no second login)

## Internationalization (i18n)

- Full Arabic (RTL) UI via `messages/ar.json` translation strings
- `useTranslations()` hook for type-safe string lookups with parameter interpolation
- RTL layout throughout (CSS logical properties, `rtl:` variants)
- Arabic-safe font handling with fallbacks

## Projects Page (`/projects`)

- Grid of project cards with live thumbnail previews (R2-hosted WebP)
- Instant rendering from the Zustand store — no loading flash on return visits
- Create new project from preset sizes (Instagram post/story, Facebook, square, portrait, etc.)
- Create custom-size project with user-specified width/height
- Create project from gallery image (auto-detects aspect ratio, sets image as background)
- Rename project (inline modal)
- Delete project (confirmation dialog)
- Duplicate project (creates a copy with all layers)
- PDF projects section — separate list with download/reorder/delete
- Download PDF project as a `.pdf` file (via `pdf-lib`)
- **Order-generated designs are hidden from this page** — they appear in a separate `/orders-designs` section (see below)

## Templates Page (`/templates`)

- Grid of booking template cards with live previews
- Create new template from preset sizes or custom dimensions
- Create template from gallery image (auto aspect ratio + background)
- Delete template (confirmation dialog)
- Per-template product assignment count badge
- Click template card → opens editor
- "Assign Products" link → template detail page

## Template Detail Page (`/templates/[productId]`)

- Shows template preview and canvas dimensions
- Lists all booking products and backend products
- Toggle product assignment to a template (assign/unassign)
- Backend product search/filter
- Edit template button → opens editor
- Back to templates link

## Orders Designs Page (`/orders-designs`)

- Dedicated section for **order-generated designs** (projects with `source: 'order'`)
- Separated from the main `/projects` list so user-created designs aren't mixed with auto-generated order designs
- Grid of design cards with live thumbnail previews
- Each card shows the design name (e.g. `ORD-12345 — حج عمرة — قالب الحج`) and last-updated date
- Click a card → opens the editor at `/editor/{projectId}` to edit that specific order's design
- Delete an order design (confirmation dialog)
- Empty state with explanation when no order designs exist yet
- Loaded via `fetchOrderDesigns()` in the Zustand store (`GET /api/projects?source=order`)
- Sidebar nav item with shopping-bag icon (between Templates and PDF Tool)

## Editor Page (`/editor/[id]`)

### Canvas

- Infinite-fit zoom — canvas auto-scales to fit the available viewport (ResizeObserver)
- Pan/zoom with pinch gestures on mobile, scroll on desktop
- Background color picker
- Background image upload (instant preview via blob: URL, uploads to R2 in background)
- Background image replacement and removal
- Safe area overlay (configurable percentage insets from each edge)
- Export canvas as JPG (high quality, 2x pixel ratio, via `html-to-image`)
- Export canvas as PNG
- Thumbnail auto-generation (debounced, 3s after last edit) with cache-busting URLs

### Layers

- **Text layers** — add text with full styling:
  - Font family (system Arabic-safe fonts + user-uploaded fonts)
  - Font size, weight (bold toggle), italic toggle
  - Text color (with eye dropper + saved colors palette)
  - Horizontal alignment (left / center / right)
  - Vertical alignment (top / middle / bottom)
  - Line height adjustment
  - Text direction (auto / RTL / LTR) — critical for Arabic + mixed content
  - Opacity slider
  - Rotation handle
  - Inline text editing via TextEditDrawer (live preview)
  - Text box width control for multi-line wrapping
- **Image layers** — upload and manipulate images:
  - Instant preview (blob: URL) with background upload to R2 + progress indicator
  - Drag to move, resize handles (8-direction), rotate handle
  - **Crop tool** — non-destructive crop modal with draggable crop rectangle:
    - Visual crop overlay with 8 resize handles (corners + edges)
    - Move crop area by dragging inside the rectangle
    - Crop coordinates stored in original image pixel space
    - "Undo crop" button to restore the full original image
    - Original image is never modified — crop is rendered via CSS at runtime
  - **Replace image** — swap the image while keeping position/size/style
  - Flip horizontal / flip vertical
  - Border (width, color, corner radius)
  - Opacity slider
  - Image scale + offset (for pan/zoom within the frame)
  - Upload retry on failure (with status overlay)
  - Collage mode (see below)
- **Shape layers** — vector + PNG shapes:
  - Built-in shapes: rectangle, circle, triangle, 4-point star, 5-point star, 6-point star, 8-point star, line
  - Custom PNG shapes (user-uploaded, stored in R2)
  - Fill color + stroke color (with eye dropper + saved colors)
  - Stroke width adjustment
  - Filled / outlined toggle
  - Corner radius (rectangle only)
  - Opacity slider
  - Rotation handle
  - PNG shapes rendered via same-origin image proxy (CORS-safe export)
  - Context menu / long-press suppression on shape images
- **Collage layers** — multi-cell image grids:
  - **Layout picker** — 15+ layouts including:
    - 2-split (horizontal / vertical)
    - 3-split (horizontal / vertical / 1-over-2 / 2-over-1 / 1-left-2 / 2-left-1 / big-left / big-right)
    - 4-grid (2×2 grid / 4-horizontal / 4-vertical)
  - Per-cell image upload (each cell has its own image)
  - **Collage editor modal** (full-page drawer) with per-cell controls:
    - Pan/drag image within cell (pointer-based, clamped to cell bounds)
    - Pinch-to-zoom + rotate (two-finger gesture on mobile)
    - Zoom slider with percentage display
    - Reset transform (restores default position/scale/rotation)
    - Replace cell image
    - Remove cell image
    - Add new cell (auto-picks a layout matching the new count)
    - **Drag-and-drop cell swap** — drag one cell onto another to swap their images (pointer-based, works on desktop + mobile, with floating drag preview + drop target highlight)
    - Tap to select a cell (selection enables pan/zoom controls)
  - Gap between cells (adjustable)
  - Collage background color
  - Container corner radius
  - Live preview in the editor canvas
- **Dynamic field layers** — order-specific placeholder fields:
  - Text fields: customer name, date, phone, order number, etc.
  - Image fields: product image, customer avatar, etc.
  - Auto-populate from booking/order data at render time
  - Border (width, color, radius)
  - Opacity slider
  - Stroke color (with eye dropper + saved colors)
- Layer selection (click to select, properties bar shows layer-specific controls)
- Layer manipulation — drag to move, resize handles, rotate handle, nudge with arrow keys
- Layer ordering — drag-and-drop reordering in the layer list (react-dnd), z-index management
- Layer visibility toggle, lock toggle
- Layer duplication, deletion
- Layer opacity slider
- Per-layer z-index, x/y position, width/height, rotation

### Undo / Redo

- Full history stack (layers + background state snapshots)
- Keyboard shortcuts: Ctrl+Z (undo), Ctrl+Shift+Z / Ctrl+Y (redo)
- Transaction-based — intermediate states during drag/slider operations are not recorded
- History is bounded to prevent memory issues

### Toolbars & Drawers

- **Top toolbar** — back button, undo/redo, export JPG/PNG, save, rename
- **Bottom bar (context-sensitive properties)** — adapts to what's selected:
  - **No selection (canvas mode)**: background color picker, background image upload, safe area settings
  - **Text layer selected**: text content, font family, font size, bold/italic, color, alignment (H+V), line height, text direction, opacity
  - **Image layer selected (single)**: replace image, crop tool, flip H/V, border (width/color/radius), opacity, aspect ratio
  - **Image layer selected (collage)**: collage editor button, layout picker, gap, background color, container radius, opacity
  - **Shape layer selected**: filled toggle, fill color, stroke color, stroke width, corner radius, opacity
  - **Dynamic field selected**: stroke width, stroke color, opacity
  - **All layers**: duplicate + delete buttons
- **Shapes drawer** — pick from built-in shapes (rectangle, circle, triangle, stars, line) or upload custom PNG shapes
- **Dynamic fields drawer** — insert order-specific text/image fields (customer name, date, phone, etc.)
- **Font drawer** — browse and select fonts (system Arabic-safe + user-uploaded), with font preview
- **Text edit drawer** — inline text editing with live preview on the canvas
- **Color picker drawer** — pick colors with saved-colors palette, HEX input, eye dropper
- **Leave modal** — prompts on unsaved changes (save/discard/cancel), with inline rename for new projects
- **Image crop modal** — full-screen crop tool with draggable/resizeable crop rectangle, undo crop
- **Collage edit modal** — full-page drawer for per-cell image editing (pan, zoom, rotate, swap, replace, add, remove)

### Color Picker

- Native EyeDropper API support (Chrome/Edge) — pick any color from the screen
- Canvas-based eye dropper fallback for mobile browsers without native support
- Mobile eye dropper overlay — touch-based color sampling on the canvas
- Saved colors palette — persist frequently used colors per user (stored in MongoDB via `/api/saved-colors`)
- Add/remove colors from the palette
- HEX input, color wheel, opacity slider
- Color swatch preview in the properties bar

### Fonts

- System fonts (Arabic-safe + Latin)
- User-uploaded fonts (stored in R2, loaded via `@font-face`)
- Font preview in the font drawer
- Font file management API (upload, delete, serve font files)

### Custom Shapes (PNG)

- User-uploaded PNG shapes (stored in R2)
- Shapes rendered as `<img>` (routed through `/api/image-proxy` for CORS-safe export)
- Context menu / long-press suppression on shape images
- Shape management API (upload, delete, list)

### Save & Leave Flow

- Explicit Save button writes to MongoDB (PATCH)
- Leave modal on back button / hardware back when there are unsaved changes
- Blank projects (no layers, no background) are discarded silently — no modal
- New/never-synced projects: "No" = delete; "Yes" = save + navigate
- Existing projects with changes: "No" = discard session changes; "Yes" = save
- Optimistic thumbnail capture before navigation (DOM snapshot while canvas is mounted)
- Background save + thumbnail upload (fire-and-forget after navigation)
- Error toast on background save failure (survives navigation via root ToastProvider)
- Single back-press to leave — `history.go(-1/-2)` with `isLeavingRef` guard to avoid popstate re-entrancy
- Returns to the correct page (projects/templates) via browser history, not hardcoded
- **Auto re-render for order designs** — when an order-generated design (`source: 'order'`) is saved, the store automatically calls `POST /api/projects/[id]/re-render` in the background (fire-and-forget). This re-renders the project to JPG via Puppeteer and overwrites the old R2 image at the same key/URL. The admin panel sees the updated design without any additional sync.

### Session & Persistence

- sessionStorage crash recovery — working state auto-saved every 300ms (debounced)
- MongoDB is the single source of truth — no IndexedDB/localStorage data mirror
- Zustand store (`use-project-store`) is the client-side cache with optimistic updates
- All mutations (create/save/delete/rename/duplicate) are optimistic — UI updates before server confirms

## PDF Tool Page (`/pdf-tool`)

- Create PDF project from multiple images (gallery picker)
- **Drag-and-drop image reordering** (react-dnd):
  - Custom drag layer with floating preview (page number + thumbnail)
  - Drag handle (grip icon) on each row
  - Above/below drop indicators (blue line)
  - Hover detection (top half = above, bottom half = below)
  - Auto-adjusts target index when dragging from above/below
- Instant image preview (blob: URL) with background upload to R2
- Upload status overlay:
  - Uploading: animated spinner overlay
  - Error: retry button overlay
  - Upload retry on failure
- Page number badges on each image
- Save PDF project to MongoDB (persist image order + URIs)
- **Download as `.pdf` file** (via `pdf-lib`):
  - Each image becomes a full page
  - Correct page dimensions (matches image natural size)
  - PNG/JPG detection for correct embedding
  - Same-origin image proxy for CORS-safe fetching from R2
- Delete PDF project (confirmation dialog)
- Print support
- Image removal (per-page)
- Reorder via drag handle with above/below drop indicators

## Booking System

- **Booking products** — link backend products to design templates
- **Backend products** — fetched from external backend API
- **Template assignment** — assign/unassign products to templates via the template detail page
- **Auto-create template** — `getOrCreateTemplateProject()` creates a template on first assignment
- **Seed endpoint** — `/api/booking-products/seed` for seeding initial booking products
- **Dynamic fields** — order fields (customer name, date, phone, etc.) that populate from booking data when rendering a template for a specific order

## Order Design Generation

- **Callback endpoint** `POST /api/orders/generate-design` — called by the backend admin panel when an admin clicks "create design" for an order:
  - Authenticated via shared secret (`x-callback-secret` header, must match `CALLBACK_SECRET` env var)
  - Receives order data (order number, item index, customer info, reservation photo, product info, etc.)
  - Looks up the template assigned to the product (text template, or image template if the order has a reservation photo)
  - Creates a **design instance** from the template (see below)
  - Renders the design instance to JPG via Puppeteer
  - Uploads the JPG to R2 at `design/orders-design/{orderNumber}[-{itemIndex}].jpg`
  - Returns the design instance's `projectId`, the R2 URL, and the template reference to the backend
  - Products without a template are reported as `noTemplate` and skipped

- **Design instances vs templates** — when a design is generated, a **copy** of the template is created as a standalone `kind: 'design'` project:
  - `lib/render/inflate-template.ts` — `inflateTemplateToDesign()` converts a template to a design instance:
    - Dynamic text fields → concrete text layers with resolved values (customer name, date, etc.)
    - Dynamic image fields → concrete image layers with resolved URLs (reservation photo, etc.)
    - All other layers pass through unchanged
    - The instance is marked `source: 'order'` and stores the R2 URL in `orderDesignUrl`
  - The design instance is saved to MongoDB as a separate project
  - Editing the design instance doesn't affect the template or future orders
  - The template only changes when the user explicitly edits it in the templates section
  - Design instance naming includes the order number for easy identification (e.g. `ORD-12345 — حج عمرة — قالب الحج`)

- **Re-render on save** — `POST /api/projects/[id]/re-render`:
  - Admin-only endpoint that re-renders an order-generated design to JPG
  - Extracts the R2 key from `project.orderDesignUrl` and overwrites the same file
  - The URL stays the same — the backend's order doesn't need updating
  - Called automatically by the store's `saveProject()` when the saved project has `source: 'order'`
  - Fire-and-forget (errors logged, don't fail the save)

## Template Rendering Pipeline

- `lib/render/template-renderer.ts` — server-side renderer that produces JPG images from projects:
  1. Builds a self-contained HTML document from the project's layers
  2. Inflates dynamic field layers with order data (resolves `billing.*`, `order.*`, `item.*`, `reservation.*` variable IDs)
  3. Loads Expo Arabic fonts from `public/fonts/ExpoArabic/` as base64 data URIs
  4. Uses **Puppeteer** (headless Chrome) to screenshot the HTML as a JPG buffer
  5. Returns the buffer for upload to R2
- Handles text layers (with full styling), image layers (R2 URLs), shape layers, and dynamic field layers
- Known limitation: collage layers are not yet supported in the server-side renderer

## Image & File Storage

- **R2 (Cloudflare)** for all image/font/shape file storage
- `uploadToR2()` / `deleteFromR2()` helpers
- Thumbnail storage at `design/thumbnails/{projectId}.webp` with cache-busting `?v=timestamp`
- Image proxy (`/api/image-proxy`) — same-origin proxy for CORS-safe image fetching
- Upload progress tracking for large images
- Instant preview pattern — blob: URL for immediate UI, R2 upload in background
- Blob: URI stripping before persistence (client-only URLs never saved to DB)

## State Management

- **Zustand** store (`use-project-store`) for projects + templates + order designs
  - Optimistic updates on all mutations (create/save/delete/rename/duplicate)
  - Store state IS the cache — components subscribe to slices, no manual invalidation
  - `getState()` access for non-React modules (booking-templates)
  - Separate `orderDesigns` array (filtered by `source: 'order'`) with its own `fetchOrderDesigns()` action
  - `saveProject()` auto-triggers re-render for order designs (fire-and-forget)
- **In-memory cache** (`createResourceCache`) for PDF projects, booking products, backend products
- **React state** for editor working state (layers, selection, zoom, history)
- **sessionStorage** for editor crash recovery

## UI / UX

- Lenis smooth scrolling (window-level, skipped on editor page)
- Toast notifications (root-level provider, survives navigation)
- Modal / AlertDialog / Drawer components
- Loading skeletons (animated pulse placeholders)
- Empty states with call-to-action
- Mobile-first responsive design with breakpoints (sm/lg)
- Touch-optimized — `touch-none`, `touch-action: manipulation`, large tap targets
- Context menu / long-press suppression on images (iOS/Android)
- Custom drag-and-drop with visual feedback (drop indicators, drag layer)
- Keyboard shortcuts (undo/redo, delete, escape)

## API Routes

- `POST /api/auth/login` — authenticate, set session cookie (SSO-compatible)
- `GET/POST /api/projects` — list/create projects (excludes `source: 'order'` by default; supports `?kind=` and `?source=` filters)
- `GET/PATCH/DELETE /api/projects/[id]` — get/update/delete a project
- `POST /api/projects/[id]/thumbnail` — upload project thumbnail to R2
- `POST /api/projects/[id]/re-render` — re-render an order design to JPG + overwrite R2 image (admin-only)
- `POST /api/orders/generate-design` — callback endpoint for the backend admin panel to generate a design for an order (shared-secret auth)
- `GET/POST /api/pdf-projects` — list/create PDF projects
- `GET/PATCH/DELETE /api/pdf-projects/[id]` — get/update/delete a PDF project
- `GET/POST /api/booking-products` — list/create booking products
- `GET/PATCH/DELETE /api/booking-products/[id]` — get/update/delete a booking product
- `POST /api/booking-products/seed` — seed initial booking products
- `GET /api/backend/products` — list backend products (proxied to external API)
- `GET/POST /api/fonts` — list/upload user fonts
- `GET/DELETE /api/fonts/[id]` — get/delete a font
- `GET /api/fonts/[id]/file` — serve font file from R2
- `GET/POST /api/shapes` — list/upload custom PNG shapes
- `DELETE /api/shapes/[id]` — delete a custom shape
- `GET/POST/DELETE /api/saved-colors` — list/save/delete saved colors
- `POST /api/upload` — generic file upload to R2
- `GET /api/image-proxy?url=...` — same-origin image proxy with CORS headers

## Admin Panel Integration

The design app integrates with the separate admin panel (`admin_panel`) for order design management:

- **SSO** — admins logged into the admin panel are automatically authenticated in the design app via the shared JWT cookie (see Authentication section above)
- **"Create Design" button** (admin panel) — calls the backend, which calls `POST /api/orders/generate-design` on this app to generate a design for an order item
- **"Edit Design" button** (admin panel) — opens `{DESIGN_APP_URL}/editor/{projectId}` in a new tab; SSO authenticates the admin automatically; the admin edits the design instance (not the template)
- **"View Design" button** (admin panel) — opens a preview modal showing the design JPG (no new tab)
- **Design icon in orders table** (admin panel) — always shows `LuPalette` icon; dimmed (`text-secondary/50`) when no design exists, primary color when a design exists; clicking it opens the preview modal
- **Re-render on save** — when the admin saves an order design in the editor, the design app automatically re-renders it to JPG and overwrites the old R2 image (same URL), so the admin panel always shows the latest version without any explicit refresh

### Environment Variables

- `CALLBACK_SECRET` — shared secret for the `/api/orders/generate-design` callback (must match `DESIGN_APP_CALLBACK_SECRET` on the backend)
- `JWT_SECRET` — shared with the admin panel for SSO token verification
- `COOKIE_DOMAIN` — parent domain for the SSO cookie (e.g. `.manasik.net`), enables cross-subdomain auth
- `R2_*` — Cloudflare R2 credentials for image storage
- `MONGODB_URI` — MongoDB connection string (shared `users_admin_panel` collection with admin panel)
