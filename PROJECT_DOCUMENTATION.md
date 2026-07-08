# تصميمات مناسك — Complete Project Documentation

> **Project**: تصميمات مناسك / Manasik Design App
> **Type**: Cross-platform Expo app (Android APK + Web on Vercel)
> **Language**: Arabic (RTL) UI
> **Stack**: Expo Router · React Native · TypeScript · FastAPI (minimal) · MongoDB (status endpoint only) · IndexedDB / AsyncStorage
> **Last documentation refresh**: Iteration 9 (June 2026)

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Architecture Overview](#architecture-overview)
3. [Feature: Project Management (Home & Persistence)](#feature-project-management-home--persistence)
4. [Feature: Design Editor — Canvas & Selection](#feature-design-editor--canvas--selection)
5. [Feature: Text Layers](#feature-text-layers)
6. [Feature: Image Layers (Mask + Frame)](#feature-image-layers-mask--frame)
7. [Feature: Image Cropping](#feature-image-cropping)
8. [Feature: Shape Layers](#feature-shape-layers)
9. [Feature: Multi-image Collage](#feature-multi-image-collage)
10. [Feature: Collage Cell Editor](#feature-collage-cell-editor)
11. [Feature: HSV Color Picker (Brand + Recent)](#feature-hsv-color-picker-brand--recent)
12. [Feature: Eyedropper v2](#feature-eyedropper-v2)
13. [Feature: PDF Tool ("إنشاء PDF من الصور")](#feature-pdf-tool-إنشاء-pdf-من-الصور)
14. [Feature: Product Booking Templates](#feature-product-booking-templates)
15. [Feature: Dynamic Field Layers](#feature-dynamic-field-layers)
16. [Feature: Cross-platform Storage (kv-storage)](#feature-cross-platform-storage-kv-storage)
17. [Feature: Backend Status API](#feature-backend-status-api)
18. [Complete Feature List](#complete-feature-list)
19. [User Roles](#user-roles)
20. [Collections / Database Overview](#collections--database-overview)
21. [API Overview](#api-overview)
22. [Application Flow](#application-flow)
23. [Admin Dashboard Overview](#admin-dashboard-overview)
24. [Configuration](#configuration)
25. [Missing Documentation](#missing-documentation)

---

## Project Overview

### Purpose
A single-user, offline-first design editor tailored for the مناسك Foundation's marketing operators. It lets non-designers compose Arabic posters, story templates, posts, and PDFs from a phone or browser, and authors fill-in-the-blanks **booking templates** that will later be auto-generated for every customer order.

### Who Uses It
- **Operators** (single role) — create/edit designs, build booking templates, export PNG/PDF.
- **(Inferred)** A future booking pipeline will inflate templates with order data; no end-customer role exists today.

### Distribution
- **Android APK** built via EAS preview profile (`build:apk` script).
- **Web** deployed to Vercel from the cleaned repo `Manasik_Design_App_V2`.

---

## Architecture Overview

```
/app
├── backend/                         # Minimal FastAPI shell (status endpoint only)
│   └── server.py
├── frontend/
│   ├── app/                         # Expo Router file-based routes
│   │   ├── _layout.tsx              # Root layout: fonts, splash, gesture root
│   │   ├── +html.tsx                # Custom web HTML wrapper
│   │   ├── index.tsx                # Home screen
│   │   ├── pdf-tool.tsx             # PDF assembly tool
│   │   ├── editor/[id].tsx          # Design editor (~3900 LOC)
│   │   └── templates/
│   │       ├── index.tsx            # Product list (Booking Templates)
│   │       └── [productId].tsx      # 6 templates per product
│   └── src/
│       ├── components/              # Reusable presentational + interactive widgets
│       ├── editor/layer-utils.ts    # Layer builders & shared palettes
│       ├── hooks/use-icon-fonts.ts  # Pre-warm Ionicons before render
│       ├── store/projects.ts        # Project/Layer types + AsyncStorage CRUD
│       ├── store/booking-templates.ts # BookingProduct CRUD + variables
│       ├── theme.ts                 # Colors, spacing, fonts, RTL detection
│       └── utils/                   # Cross-platform helpers
│           ├── kv-storage.ts        # IndexedDB (web) / AsyncStorage (native) adapter
│           ├── collage-layouts.ts   # Shape-tree layout descriptors
│           ├── eyedropper-v2.ts     # Web EyeDropper + canvas fallback
│           ├── eyedropper.ts        # Legacy native captureRef pipeline
│           └── storage/             # Project-folder storage helpers (web/native split)
```

### Key Architectural Decisions
- **Single-screen editor** (`app/editor/[id].tsx`) handles every project type (design + booking template) — kept monolithic to avoid duplicating the canvas/selection logic.
- **Layer discriminated union** (`AnyLayer`) drives all rendering paths.
- **No real backend** for projects: everything persists locally via `kv-storage` → IndexedDB on web, AsyncStorage on native. The FastAPI server only exposes a placeholder `/api/status` endpoint.
- **Project kind discriminator** (`kind: "design" | "booking_template"`) lets the same Project shape serve both regular designs and booking templates without forking the schema.

---

## Feature: Project Management (Home & Persistence)

### Purpose
Provides the home screen where operators see their recent designs, gallery images, exports, and PDF projects; also handles creating, renaming, duplicating, and deleting projects.

### Who Uses It
Every operator. It is the launch screen of the app.

### Description
1. **Home screen** (`app/index.tsx`) renders three vertical sections: «صور حديثة» (recent gallery images), «أدوات سريعة» (quick tools — PDF & Booking Templates), and «مشاريعي» (saved design projects).
2. On focus, the screen reloads `listProjects()`, `listExports()`, `listPdfProjects()`, and the gallery (`MediaLibrary.getAssetsAsync`).
3. Tapping a project navigates to `/editor/[id]`. Each project row has long-press / triple-dot menu for rename, duplicate, delete.
4. **+ FAB** opens "مشروع جديد" sheet — pick a preset size (`PRESET_SIZES`) **or** an aspect ratio via `AspectRatioPicker` **or** «استخدم حجم الصورة» which infers dims from a chosen background.
5. The newly-created project is persisted via `saveProject` and the user is routed to the editor.
6. The home screen filters out booking templates via `listProjects()` (returns only `kind === "design"` projects).

### Validation Rules
- Project name defaults to "تصميم جديد" if empty.
- Canvas dimensions are bounded only by editor-driven sanity checks (the home sheet trusts presets).

### Edge Cases
- If gallery permission is denied, a placeholder card prompts the user to open Settings.
- If `listProjects` throws, the catch block returns `[]` so the UI stays empty rather than crashing.

### Database (Local)
| Key (kv-storage)        | Type       | Shape                                  |
|-------------------------|------------|----------------------------------------|
| `manasik:projects`      | JSON array | `Project[]` (regular + booking, mixed) |
| `manasik:exports`       | JSON array | `ExportedItem[]` (last 30)             |
| `manasik:pdf_projects`  | JSON array | `PdfProject[]`                         |

### UI
- **Sections**: Recents (horizontal scroll), Quick Tools (vertical cards — PDF tool, Booking Templates), My Projects (vertical cards).
- **Components**: `RefreshControl`, `Image`, `AspectRatioPicker`, `Modal` for rename, `Alert` for delete confirm.
- **Empty states**: Each section shows a neutral message ("لا توجد مشاريع بعد"). Gallery section shows permission CTA.
- **Loading**: First read awaits storage; no spinner — the screen is purely list-based.
- **Errors**: Wrapped in try/catch with `Alert.alert` for user-facing failures (e.g. duplicate).

### Business Logic
- **Sorting**: newest `updatedAt` first.
- **Rename trims** whitespace; falls back to original name if blank.
- **Duplicate** regenerates all layer ids and appends " — نسخة" (suffix).
- **Default thumbnail** is missing initially; populated on later editor exports (not yet automated — see Limitations).

### Known Limitations
- Thumbnails are not auto-generated; the field exists on `Project` but nothing writes to it yet.
- No multi-select / bulk delete.

---

## Feature: Design Editor — Canvas & Selection

### Purpose
The core canvas: place, drag, scale, rotate, group and stack layers. Hosts ~3900 LOC in `app/editor/[id].tsx`.

### Who Uses It
Operators.

### Description
- **Loads** a `Project` by id from `kv-storage` (`getProject`). Stores it in state, autosaves on every change with a debounce.
- **Layers** are rendered top-down by `zIndex`. Each layer's actual rendering is delegated to `LayerRenderer`.
- **Selection**: tapping a layer sets `selectedId`; transparent hit-test boxes around each layer enable selection. Selected layer shows a `SelectionBox` with translate/rotate/scale handles.
- **Gestures**: powered by `react-native-gesture-handler` `Gesture.Pan` + `Gesture.Rotation` + `Gesture.Pinch` (composed with `Gesture.Simultaneous`). Reanimated `useSharedValue`s drive smooth gesture math.
- **Undo / Redo**: history maintained via a `useRef<HistoryStack>` of project snapshots; debounced commit on gesture end.
- **Bottom toolbar** is contextual:
  - No selection → primary action FAB to add layers.
  - Text selected → `TextToolbar` (font, size, color, alignment, italic/bold, edit modal).
  - Image selected → `ImageToolbar` (replace, crop, flip, mask shape, collage tools).
  - Shape selected → `ShapeToolbar` (fill, stroke, corner radius for rectangles).
  - Dynamic field selected → currently re-uses generic transform handles; no dedicated toolbar yet (see Limitations).
- **Add Layer Sheet** (`AddLayerSheet`) shows: نص, صورة, an optional «حقل ديناميكي» (only when `project.kind === "booking_template"`), and a grid of shapes.
- **Layer panel**: `DraggableLayerList` provides a side drawer for renaming, locking, hiding, deleting, and reordering layers via long-press drag.
- **Color sync**: when `ColorPickerSheet` returns a color, the editor dispatches an updater that picks the right field (`text.color` for text, `borderColor` for image, `color` for dynamic field, `fillColor` for shape).

### Validation
- Layer dimensions clamp to a sane minimum (1px for text, 20px for images).
- Project name trimming applied on save.

### Edge Cases
- Locked layers reject pointer interactions but still render.
- Hidden layers (`visible: false`) skip rendering entirely.
- Project not found → editor renders an error state with a "العودة" CTA.

### State Management
- Local `useState` for transient UI flags (sheets, picker visibility).
- `useRef` for performance-critical refs (gesture base values).
- A reducer-like updater (`updateProject`) merges patches and pushes to undo stack when `record === true`.

### Performance
- `LayerRenderer` is wrapped in `React.memo`.
- Selection box uses `Animated.View` so panning never re-renders the React tree.
- Heavy modals (color picker, crop, collage editor) are mounted but conditionally rendered behind `visible` props.

### Known Limitations
- File is monolithic (~3900 LOC). Splitting into `editor/components/*` is queued.
- Snap-to-grid / guides not implemented.

---

## Feature: Text Layers

### Purpose
Add Arabic / mixed-direction text to a design.

### Description
- Created via `buildTextLayer` (initial text empty, font `ExpoArabic_Bold`, size 8% of smaller canvas side).
- The `TextNode` inside `LayerRenderer` auto-detects RTL via `isRTLText` (theme helper) to set `writingDirection` correctly.
- The `TextEditModal` provides a full-screen editor with live preview, font picker (`ARABIC_SAFE_FONTS`), size slider, color via the HSV color picker, bold/italic, alignment, line-height slider, and an optional fixed `boxWidth` for wrapping.
- A dynamic background contrast: if the text color is bright, the modal's preview shows a dark backdrop, and vice versa (improves legibility while authoring).

### Database
| Field        | Type                              | Notes                              |
|--------------|-----------------------------------|------------------------------------|
| text         | string                            | The literal characters             |
| fontFamily   | string                            | One of `ARABIC_SAFE_FONTS` ids     |
| fontSize     | number (canvas px)                |                                    |
| color        | string                            | Hex                                |
| bold/italic  | boolean                           |                                    |
| align        | "left" \| "center" \| "right"     |                                    |
| lineHeight   | number                            | Multiplier (default 1.3)           |
| direction    | "auto" \| "rtl" \| "ltr"          | Auto detection by default          |
| boxWidth?    | number                            | Optional fixed-width wrapping      |

### Known Limitations
- No text-on-path / curved text.
- No outline/glow effects.

---

## Feature: Image Layers (Mask + Frame)

### Purpose
Place a photo on the canvas inside a configurable mask (rectangle/rounded rectangle/circle) with a frame border.

### Description
- `buildImageLayer` defaults the mask to 4:5 portrait at 60% of canvas; computes `imageScale` so the source covers the mask (no letterbox).
- `ImageNode` renders the layer as `position: absolute` `expo-image` inside a `View` with `overflow: hidden` and `borderRadius` driven by the mask shape.
- `ImageToolbar` actions:
  - **استبدال الصورة** — pick a new image from the gallery (preserves frame).
  - **اقتصاص** — opens `ImageCropModal`.
  - **مقلوب** — flips `flipX` / `flipY`.
  - **حواف** — adjusts `borderRadius` (rectangle ↔ pill ↔ circle).
  - **إطار** — opens the color picker for `borderColor`.
  - **+ صور** — appends additional images and converts the layer into a collage (see next section).

### Database
| Field        | Type    | Notes                                            |
|--------------|---------|--------------------------------------------------|
| uri          | string  | base64 or `file://`                              |
| width/height | number  | Natural image size                               |
| maskWidth/H  | number  | Visible frame in canvas px                       |
| offsetX/Y    | number  | Pan offset inside the mask                       |
| imageScale   | number  | Scale of image inside the mask                   |
| borderRadius | number  | 0..(min(maskW, maskH)/2) for pill/circle         |
| borderColor  | string  | Hex                                              |
| borderWidth  | number  | px                                               |
| flipX/Y      | boolean |                                                  |

---

## Feature: Image Cropping

### Purpose
Non-destructive cropping of an image layer.

### Description
- `ImageCropModal` shows the full original image, fit-to-screen.
- A semi-transparent overlay + a draggable crop rectangle with 4 corner handles let the user define the visible region. Rule-of-thirds guides aid composition.
- On Apply, the modal translates the crop rect (in image px) into updates to `maskWidth`, `maskHeight`, `offsetX`, `offsetY`, and `imageScale`. The original `uri` is never touched, so re-opening always restores a fresh full-image crop.
- Implemented with `Gesture.Pan` (move) and a separate `Gesture.Pan` per handle (resize). `useSharedValue` drives the rectangle's animated position.

### Validation
- `MIN_CROP = 40` display px — prevents degenerate slivers.
- Pan clamps to image bounds so the user can't drag outside the photo.

### Known Limitations
- No aspect-ratio lock yet (free crop only).
- No pinch-to-zoom inside the crop view (queued under "Pinch-to-Zoom in ImageCropModal").

---

## Feature: Shape Layers

### Purpose
Decorative shapes (rectangles, circles, stars, triangles, lines).

### Description
- Built by `buildShapeLayer` with sensible defaults (centered, 30% of canvas).
- `ShapeNode` (inside `LayerRenderer`) uses `react-native-svg` `<Svg>` + primitives:
  - `Rect` for rectangles (with optional `rx` corner radius for `rectangle_free` variant).
  - `Circle` for circles.
  - `Polygon` for triangles and stars.
  - `Path` (`starPath` helper) for 5-point, 4-point, 6-point, and 8-point stars.
  - `Line` for straight lines.
- `ShapeToolbar` exposes fill, stroke, stroke width.

---

## Feature: Multi-image Collage

### Purpose
Combine 2–9 images into one `ImageLayer` with grid or asymmetric layouts.

### Description
- Triggered by tapping **+ صور** on an existing image layer, OR by selecting multiple images at once when adding a new image layer.
- The layer gains `collageImages: string[]` and `collageCells: CollageCell[]` (per-cell pan + scale).
- `CollageLayout` enumerates **19 layouts** (symmetric grids, vertical/horizontal strips, plus asymmetric `t1b2`, `t2b1`, `l1r2`, `l2r1`, `t1b3`, `t3b1`, `l1r3`, `l3r1`, `t2b4`).
- Layouts are defined in `collage-layouts.ts` as recursive **shape trees**: each node is either a leaf (cell index `number`) or a container `{ direction: "row" | "column", items, flex? }`.
- `CollageRenderer` walks the shape tree using `walkShape` and renders cells with a flex tree.
- The `CollageLayoutSheet` (in the editor) lists every layout whose `count === collageImages.length` (strict count filter) plus an "تلقائي ✨" auto option. Visual SVG-flex thumbnails replace text labels per UX request. Sheet uses horizontal scroll with an opaque background.

### Mask Semantics
- Each cell renders its image at scale ≥ 1, sized **130%** of the cell by default with `left: -15%, top: -15%`. The cell acts as a clip mask; panning reveals the previously-hidden edges of the image instead of showing whitespace.
- `cellAt` helper defaults `scale: 1.3` for any cell missing a scale value.

### Default Cell Initialisation
- When multiple images are added via `addImageLayer`, the editor pre-populates `collageCells` with `{ offsetX: 0, offsetY: 0, scale: 1.3 }` so panning works immediately.

### Database
| Field                      | Type                              |
|----------------------------|-----------------------------------|
| collageImages              | string[]                          |
| collageCells               | CollageCell[]                     |
| collageLayout              | CollageLayout                     |
| collageGap                 | number (default 8 px)             |
| collageCellRadius          | number (default 8 px)             |
| collageBackgroundColor     | string (default `#FFFFFF`)        |

### Known Limitations
- 5 / 7 / 8 images have no exact-match layouts; the layout sheet falls back to "تلقائي" only (uses next-larger grid with empty trailing cells).

---

## Feature: Collage Cell Editor

### Purpose
After building a collage, let the operator move/zoom each cell's image individually, replace a single cell, delete a cell, or add a new cell.

### Description
- Opened from `ImageToolbar`'s «تحرير الصور» button when the layer is a collage.
- Renders a 320×320 px preview using `CollageRenderer` with the live `cells` array.
- A **CellSelectionOverlay** (border-only, `pointerEvents: none`) draws a green border around the active cell. Tap-hit testing is performed by a single unified gesture pipeline:
  - **Native** (Android/iOS): `PanResponder` capturing all pointer events on the wrapper.
  - **Web**: raw DOM `pointerdown/move/up/cancel/leave` listeners attached via `useEffect` to `wrapperRef.current` with `setPointerCapture` + `touchAction: none`. The previous PanResponder-based attempt failed on RN-web Modals (verified across 3 iterations).
- **Gestures** while a cell is selected:
  - One-finger drag → pans the cell's image (`offsetX/Y`).
  - Two-finger pinch → updates `scale` (1.0 .. 4.0).
  - Web (mouse only) also exposes `WebZoomBar` with +/- buttons since pinch is touch-only.
- **Per-cell actions** (action row at the bottom):
  - إعادة ضبط — resets `offsetX/Y` to 0, scale to 1.3.
  - استبدال — replaces the cell's URI (re-uses ImagePicker).
  - حذف — removes the cell; auto-relayouts via `suggestLayout(newCount)`. Refuses if uris.length ≤ 2.
- **Add image** (+) button in the header — multi-select up to (9 − current count) images and auto-relayouts.

### Hooks Safety
All hooks (`useState`, `useMemo`, `useRef`, `useEffect`, `useSafeAreaInsets`) are called at the top BEFORE any conditional return; the early `if (!visible) return null;` was the source of the original "Rendered more hooks…" crash and has been moved AFTER the hooks layer.

### Default Mask Scale
- New cells default to scale 1.3 so the user has immediate pan room.

### Tests Passed
- Iteration 5–7 (overhaul): 6/6 tests pass on Web — drag pan works, taps select, zoom buttons increment, no hooks crashes, add-image visible.

### Known Limitations
- Pinch on touch-screen Web is dependent on browser support for multi-pointer events (most modern mobile browsers OK).

---

## Feature: HSV Color Picker (Brand + Recent)

### Purpose
A unified picker reused everywhere a color is chosen (text fill, image border, shape fill/stroke, dynamic field colors, etc).

### Description
- `ColorPickerSheet` is a bottom sheet `Modal` rendered with a draggable SV (saturation × value) square + a hue slider.
- HSV → RGB → HEX conversion helpers (`hexToRgb`, `rgbToHex`, `hsvToRgb`, plus an `rgbToHsv` for the reverse trip).
- **HEX and RGB inputs** allow numeric entry; both directions sync.
- **الألوان المحفوظة** row shows `BRAND_COLORS` (6 predefined Manasik colors).
- **الألوان الأخيرة** row reads/writes `recent-colors.ts` (keeps up to 12 most-recent unique hex values via AsyncStorage).
- **Optional transparent swatch** for stroke/fill targets that allow transparency.
- **Eyedropper button** delegates to the parent component via `onEyedrop` prop (see next section).

### Storage
| Key                       | Value type | Cap |
|---------------------------|------------|-----|
| `manasik:recent-colors`   | `string[]` | 12  |

---

## Feature: Eyedropper v2

### Purpose
Pick a color from anywhere on the canvas (or screen) — Photoshop-style.

### Description (Strategy by Platform)
- **Desktop browsers (Chrome / Edge / Opera / Safari 17+)**: uses the native `window.EyeDropper` API for a system-wide crosshair cursor.
- **Mobile / older browsers**: captures the rendered canvas via `html-to-image` into an offscreen `<canvas>` and samples pixels via `getImageData`.
- **Native iOS / Android**: `react-native-view-shot` (captureRef) + `upng-js` decoder samples a pixel from the PNG bytes.

### Files
- `src/utils/eyedropper-v2.ts` — new dispatcher.
- `src/utils/eyedropper.ts` — legacy native-only implementation kept as a fallback.

### Validation / Failure Handling
- If the chosen platform branch throws (e.g. user cancels the EyeDropper), the function rejects; the caller treats this as a no-op.
- `html-to-image` failures are caught and surfaced as a friendly Alert in the editor.

### Known Limitations
- Chrome on Android does NOT implement `window.EyeDropper`; the `html-to-image` fallback is used but can sample black if the rendered DOM isn't fully painted yet at capture time.

---

## Feature: PDF Tool ("إنشاء PDF من الصور")

### Purpose
Assemble a multi-page PDF from device images + previously-exported designs.

### Description
- Route: `/pdf-tool` (optionally with `?projectId=…` to resume).
- Persisted as a `PdfProject` entity (separate from design Projects).
- **Add images** from either the gallery (multi-select) or the user's recent app exports.
- **Reorder** images:
  - **Native**: long-press drag using `react-native-draggable-flatlist`.
  - **Web**: drag-and-drop is unreliable — replaced with stacked ⬆️ / ⬇️ chevron buttons per row. The `renderItem` selects between drag handle (native) and arrow column (web) via `Platform.OS`. (A testing-agent fix wrapped each row in `React.Fragment` instead of `ScaleDecorator` on Web to avoid `CellProvider` crashes.)
- **Generate**:
  1. Each image gets normalised via `expo-image-manipulator` to fit A4 (210×297 mm) while preserving aspect.
  2. `pdf-lib` builds a multi-page PDF; pure-JS base64 helpers (`bytesToBase64` / `base64ToBytes`) avoid native deps.
  3. Saved as a base64 data URI; on Web triggers a Blob download, on native saves to FileSystem.documentDirectory and offers `Sharing.shareAsync`.
- **A4 fix**: each image is wrapped in a `210mm × 297mm` `.page` div with explicit `page-break-after: always` AND a CSS `@page { size: A4 }` rule — without this, Android WebView print engine collapses all rows onto a single physical page.

### Database
| `PdfProject` field | Type      |
|--------------------|-----------|
| id                 | string    |
| name               | string    |
| images             | string[]  |
| pdfUri?            | string    |
| createdAt          | number    |
| updatedAt          | number    |

### Known Limitations
- No page rotation / per-page sizing.
- No password protection.

---

## Feature: Product Booking Templates

### Purpose
Author **fill-in-the-blanks design templates** for products on the مناسك booking website. At fulfilment time the system will pick the matching template based on the order's product + quantity and substitute dynamic fields with real booking data.

### Who Uses It
Operators. (The future automatic render engine is **not yet implemented** — see Limitations.)

### Description
1. **`/templates` (Product List)** shows every `BookingProduct`. Three are pre-seeded on first boot:
   - خروف عقيقة بالطعام
   - خروف كبير عقيقة بالطعام
   - كبش عقيقة بالطعام
2. **+ FAB → AddProductSheet** lets the operator add a new product. Inputs:
   - **Name** (required).
   - **Background image** (optional) — picked via `expo-image-picker`; its natural dimensions auto-fill width/height.
   - **Width × Height** — manual inputs OR 3 quick presets (مربع 1080², ستوري 1080×1920, بوست 1200×1500).
   - Bounds: 50–6000 px each axis.
   - The chosen canvas + background are stored as `defaultCanvas` and **inherited by every freshly provisioned template** (not retroactively applied).
3. **Product Detail (`/templates/[productId]`)** renders TWO model sections:
   - **موديل بصورة** (`withImage`) — for orders that include a customer photo.
   - **موديل بدون صورة** (`withoutImage`) — pure-text templates.
   Each model has THREE variant cards keyed by Arabic grammatical number:
   - **قطعة واحدة** (single) — quantity = 1.
   - **قطعتين** (double) — quantity = 2.
   - **أكثر من قطعتين** (multiple) — quantity ≥ 3.
   ⇒ **6 templates per product** in total. Each card shows whether it has been authored ("لم يُصمم بعد" or "محرّر" with layer count).
4. **Lazy provisioning**: tapping a card calls `getOrCreateTemplateProject(productId, model, variant)` which either loads the existing project or creates a new `Project` with `kind: "booking_template"`, `bookingMeta: { productId, model, variant }`, `canvasWidth/Height` from `defaultCanvas`, and `backgroundUri` if set. Then opens the standard editor.
5. **Auto-migration**: on first read of `listBookingProducts()`, any legacy product whose `templates` is the flat shape `{ single, double, multiple }` is lifted into `{ withImage: { single, … }, withoutImage: { single: null, … } }`. Migrated payload is persisted so the conversion runs once.
6. **Deletion** cascades: removing a product deletes the linked template projects (best-effort).

### Business Rules
- `listProjects()` filters out booking-template projects so they never pollute "مشاريعي".
- `listBookingTemplateProjects()` returns them in isolation for internal use.
- Project name pattern: `"<product> — <model> — <variant>"`, e.g. `"خروف عقيقة — بصورة — قطعتين"`.

### Database (`BookingProduct`)

```ts
{
  id: string;
  name: string;
  imageUri?: string;
  createdAt: number;
  updatedAt: number;
  defaultCanvas: { width: number; height: number; backgroundUri?: string };
  templates: {
    withImage:    { single: id|null; double: id|null; multiple: id|null };
    withoutImage: { single: id|null; double: id|null; multiple: id|null };
  };
}
```
Stored under `manasik:booking_products` via `kv-storage`.

### UI
- **List screen**: card-per-product, ratio of authored templates (`X / 6 قوالب`), trash icon for delete.
- **Detail screen**: two sections (Model With/Without image), each containing 3 variant cards with icon + rule chip + meta (layers count, field count).
- **Empty state**: list shows the standard "لا توجد منتجات بعد" + CTA when empty (only possible after deleting all three seeds).

### Known Limitations
- No backend sync — products & templates are still local-only.
- No fulfilment/render engine yet: pressing a template just opens the editor; nothing substitutes real booking data into the placeholders.
- No "duplicate product" action.

---

## Feature: Dynamic Field Layers

### Purpose
Placeholder rectangles inside booking templates that mark where real booking data should appear after fulfilment.

### Description
- Created only when inside a `kind === "booking_template"` project; the «حقل ديناميكي» button in `AddLayerSheet` is conditionally rendered.
- Picking the action opens **`VariablePickerModal`** with two tabs:
  - **متغيرات جاهزة**: 5 predefined variables — `customer_name` (الاسم, text), `execution_date` (تاريخ التنفيذ, date), `customer_image` (صورة, image), `dua` (دعاء, text), `booking_number` (رقم الحجز, text).
  - **حقل مخصص**: arbitrary `name` (regex `/^[a-zA-Z_][a-zA-Z0-9_]*$/`) and Arabic `label`. Field type defaults to `custom`.
- **Image-type variables** route through a second modal — **`ImageFieldSizeModal`** — that prompts for placeholder dimensions BEFORE placing it:
  - 4 quick-aspect presets (مربع صغير, مربع وسط, بورتريه, بانوراما) computed from `canvasWidth`.
  - Manual `width × height` inputs (bounds 20 .. min(canvasW, canvasH)).
  - Confirm button label includes the chosen dimensions.
- `buildDynamicFieldLayer` sets sane defaults (font size 6% of canvas, dashed primary border, `fontFamily: ExpoArabic_Bold`, `borderColor: #0A5C36`).
- **`DynamicFieldNode`** (LayerRenderer) renders the placeholder with:
  - Dashed primary border (so it's visually distinct from real layers).
  - Either a 🖼️ icon + label (for image type) or the Text default value (for text/date/custom).
  - A small dark-green badge at the top-right showing `{variableName}` — always visible so the operator can immediately tell which booking field will replace it.
- The layer is fully selectable / draggable / scalable / rotatable like any other layer. Dimensions are editable later by selecting + dragging the bounding box handles.
- **Hit-testing**: `bboxW/bboxH` in the editor are augmented to read `layer.width / layer.height` for dynamic_field, so the selection box matches the placeholder rectangle.

### Database (`DynamicFieldLayer`)

```ts
{
  type: "dynamic_field";
  fieldType: "text" | "date" | "image" | "custom";
  variableName: string;        // snake_case, matches booking payload key
  variableLabel: string;       // Arabic display label
  defaultValue: string;        // shown in editor + fallback at render
  width: number; height: number;
  fontFamily?, fontSize?, fontWeight?, color?, textAlign?
  backgroundColor?, borderColor?, borderWidth?, borderRadius?
  imageFit?: "cover" | "contain";
}
```

### Known Limitations
- No dedicated **DynamicFieldToolbar**: while the layer is selected, the user can transform it but cannot change `fontSize`, `color`, `textAlign`, etc. from the toolbar yet. (Color picker still hits it via the universal updater — sets `color`.)
- No way to **rebind** an existing field to a different variable without deleting + re-adding.

---

## Feature: Cross-platform Storage (kv-storage)

### Purpose
Bypass localStorage's ~5 MB cap on web so projects containing base64 images survive page refresh.

### Description
- `src/utils/kv-storage.ts` exposes `getItem / setItem / removeItem` with the same signature as AsyncStorage.
- Branches on `Platform.OS`:
  - **Web** → `idb-keyval` (IndexedDB) for large reads/writes; values < 1 KB are mirrored into localStorage too so legacy code can still read them.
  - **Native** → forwards to `AsyncStorage` unchanged (existing user data preserved).
- Migration: on first web read, if a key exists in localStorage but not IDB, it is copied into IDB transparently.

### Fall-back Behavior
- IDB blocked (private mode, quota exceeded) → catches and falls through to AsyncStorage.

---

## Feature: Backend Status API

### Purpose
Placeholder FastAPI endpoint kept for future expansion (logs heart-beat client check-ins to MongoDB).

### Description
- `backend/server.py` is a 76-line FastAPI app exposing two routes under `/api`:
  - `GET /api/` → `{ "message": "Hello World" }`
  - `POST /api/status` (body `{ "client_name": str }`) → inserts a `StatusCheck` doc into `db.status_checks` and returns the persisted record (including UUID + UTC timestamp).
  - `GET /api/status` → returns the latest 1000 status checks.
- CORS is wide-open (`allow_origins=["*"]`) — fine for the placeholder usage.
- MongoDB connection comes from env (`MONGO_URL`, `DB_NAME`).

### Authentication
None. The endpoints are unauthenticated.

### Known Limitations
- **No production usage**: the frontend never calls these endpoints. They exist as scaffolding only.
- No request validation beyond `pydantic` schema.

---

## Complete Feature List

- [x] Home screen with recent gallery images, projects, exports, PDF projects
- [x] New project sheet (presets + aspect ratio + image-derived sizing)
- [x] Project CRUD (create, rename, duplicate, delete) via IndexedDB / AsyncStorage
- [x] Design editor — canvas, pan/zoom/rotate gestures, undo/redo, autosave
- [x] Text layers — Arabic / RTL aware, fonts, sizes, colors, bold/italic, alignment, line-height, optional box-width wrapping
- [x] Image layers — gallery import, masks, frames (border), flip X/Y, border-radius shaping
- [x] Image cropping with rule-of-thirds guides
- [x] Shape layers — rectangle, rounded rectangle, circle, line, triangle, 4/5/6/8-point stars
- [x] Multi-image **collage** — 19 layouts incl. asymmetric (1+2, l1r3, etc.), shape-tree renderer
- [x] **Collage Cell Editor** — tap-to-select, one-finger pan, two-finger pinch, replace / delete / add cell, web-specific +/- zoom bar
- [x] **HSV color picker** — SV square + hue slider, HEX/RGB inputs, brand & recent rows, eyedropper
- [x] **Eyedropper v2** — native `window.EyeDropper`, `html-to-image` fallback, native view-shot pipeline
- [x] Draggable layer list (lock, hide, rename, delete, reorder)
- [x] Export designs as PNG (web: html-to-image / native: react-native-view-shot)
- [x] Export designs as PDF (web blob download / native sharing)
- [x] **PDF Tool** — assemble multi-page A4 PDFs from gallery + recent exports, drag (native) or arrow buttons (web) reorder
- [x] **Booking Templates section** — `/templates` list with seeded products + custom product creation
- [x] **Product detail** — 2 models × 3 quantity variants = **6 templates per product**
- [x] **Dynamic Field layer** with `VariablePickerModal` (5 predefined + custom) and `ImageFieldSizeModal` (presets + manual dims)
- [x] **kv-storage** (IndexedDB on web, AsyncStorage on native)
- [x] Cross-platform Arabic font loading (Tajawal, IBM Plex Sans Arabic, ExpoArabic_Bold)
- [x] Pre-seeded brand colors and recent-color tracking
- [x] Standalone APK + Web deploy pipelines (EAS preview / Vercel)
- [x] Minimal FastAPI status endpoint (placeholder)

### NOT Implemented (Explicitly)
- [ ] Cloud sync (Cloudflare R2 + Google Auth) — paused per user request.
- [ ] Booking-data render engine (substituting `{customer_name}` etc. with real values + exporting).
- [ ] Test-booking preview on product detail page.
- [ ] Dedicated `DynamicFieldToolbar` (typography for placeholders).
- [ ] Custom font upload (`.ttf` / `.otf`).
- [ ] Ready-made design templates library.
- [ ] AI tools.
- [ ] Push notifications.
- [ ] Real authentication / multi-user accounts.

---

## User Roles

There is **only one role**: the **Operator**. There is no auth, no admin, no customer-facing surface. Anyone with access to the app or the Vercel URL can perform every action.

| Capability                              | Operator |
|-----------------------------------------|:--------:|
| Browse / open / delete projects         | ✅       |
| Create new designs                      | ✅       |
| Create / edit / delete products & their booking templates | ✅       |
| Insert dynamic fields                   | ✅       |
| Export PNG / PDF                        | ✅       |
| Generate multi-page PDFs                | ✅       |

---

## Collections / Database Overview

The app's persistent state lives in **the browser's IndexedDB (web)** or **AsyncStorage (native)** under a small set of keys. There is **no remote database** for project data; MongoDB is used only by the placeholder `/api/status` endpoint.

```
kv-storage (web: IndexedDB, native: AsyncStorage)
├── manasik:projects         → Project[]   (regular + booking templates, discriminated by `kind`)
├── manasik:exports          → ExportedItem[]   (capped at 30 most recent)
├── manasik:pdf_projects     → PdfProject[]
├── manasik:booking_products → BookingProduct[]
└── manasik:recent-colors    → string[]    (capped at 12 hex strings)

MongoDB (via backend/server.py)
└── status_checks            → StatusCheck   (placeholder; not used by the app)
```

### Relationships
- `BookingProduct.templates.{withImage|withoutImage}.{single|double|multiple}` → references a `Project.id` (when authored) inside `manasik:projects`.
- `Project.bookingMeta.{productId, model, variant}` is the reverse link from a booking-template project back to its product.
- `ExportedItem.projectId` → optional reference back to the design project that produced the export.
- `PdfProject` is standalone (no FK to other entities).

### Indexes
None. Lookups are linear scans on parsed JSON arrays; acceptable for the small scale (hundreds of projects).

---

## API Overview

### Backend (FastAPI)
| Method | URL              | Body                          | Response                 | Auth | Notes |
|--------|------------------|-------------------------------|--------------------------|------|-------|
| GET    | `/api/`          | —                             | `{ "message": "Hello World" }` | — | Health |
| POST   | `/api/status`    | `{ "client_name": str }`      | `StatusCheck` (with id + ts) | — | Logs to MongoDB |
| GET    | `/api/status`    | —                             | `StatusCheck[]` (≤ 1000) | — | Reads from MongoDB |

### Frontend "internal API" (store functions)
| Function                              | Module                       | Purpose                                        |
|---------------------------------------|------------------------------|------------------------------------------------|
| listProjects / listAllProjects / listBookingTemplateProjects | `src/store/projects.ts`      | List design / all / booking-only projects     |
| getProject / saveProject / deleteProject | `src/store/projects.ts`   | CRUD for a single project                     |
| duplicateProject / renameProject      | `src/store/projects.ts`      | Project utilities                              |
| listExports / addExport               | `src/store/projects.ts`      | Track last 30 PNG/PDF exports                  |
| listPdfProjects / getPdfProject / savePdfProject / deletePdfProject / renamePdfProject | `src/store/projects.ts` | CRUD for PDF assembly state |
| listBookingProducts / getBookingProduct / createBookingProduct / saveBookingProduct / deleteBookingProduct | `src/store/booking-templates.ts` | Product CRUD |
| getOrCreateTemplateProject            | `src/store/booking-templates.ts` | Lazy provisioning of (model, variant) projects |
| PREDEFINED_VARIABLES, VARIANT_LABELS, MODEL_LABELS | `src/store/booking-templates.ts` | Constants exported to UI |

### External Integrations
| Library / API        | Where                                  | Why                                              |
|----------------------|----------------------------------------|--------------------------------------------------|
| `pdf-lib`            | PDF tool                               | Build multi-page A4 PDFs in pure JS              |
| `html-to-image`      | Web exports + eyedropper fallback       | DOM → PNG without native modules                 |
| `react-native-view-shot` | Native exports + native eyedropper   | RN component → PNG bytes                         |
| `upng-js`            | Native eyedropper                       | Decode PNG bytes to pixel array                  |
| `expo-image-picker`  | Image layers, collage, backgrounds      | Gallery access                                   |
| `expo-image-manipulator` | PDF tool                            | Resize/normalise images for A4 pages             |
| `expo-media-library` | Home recents + export-save              | Gallery enumeration / save-to-photos             |
| `expo-print`         | PDF tool (native print path)            | Native printing                                  |
| `expo-sharing`       | PDF/PNG export                          | Share sheet                                      |
| `idb-keyval`         | kv-storage (web)                        | Lightweight IndexedDB wrapper                    |
| `react-native-reanimated` + `react-native-gesture-handler` | Editor gestures | High-perf pointer math |
| `react-native-svg`   | Shapes + collage thumbnails             | Vector primitives                                |
| `react-native-draggable-flatlist` | PDF tool (native)            | Reorderable list                                 |
| `@expo-google-fonts/tajawal`, `…/ibm-plex-sans-arabic` | _layout | Arabic fonts                          |

**No external paid integrations are configured.** No API keys are required anywhere in the codebase today.

---

## Application Flow

```
┌──────────────────────────────────────────────────────────────────┐
│                      Splash + Font preload                       │
│   _layout.tsx → useIconFonts() + useTajawal()                    │
└────────────────────────────────┬─────────────────────────────────┘
                                 ▼
                       Home screen (/) — index.tsx
                                 │
        ┌────────────────────────┼──────────────────────────────────┐
        ▼                        ▼                                  ▼
   مشاريعي                Quick Tools                       Recents / Exports
    list                  ┌──────────────┐                  (gallery + exports)
        │                 ▼              ▼
        │           إنشاء PDF   قوالب الحجوزات
        │           /pdf-tool   /templates
        │                                │
        ▼                                ▼
   editor/[id]                     /templates list  ────► AddProductSheet
   (kind="design")                         │                        │
        │                                  ▼                        ▼
        │                       /templates/[productId]       BookingProduct.create
        │                       6 variant cards                     │
        │                       (2 models × 3 sizes)                │
        ▼                                  │                        │
   Compose layers                          ▼                        │
   • Text                            getOrCreateTemplateProject     │
   • Image (+ collage)                     │                        │
   • Shape                                 ▼                        │
   • [if booking template]            editor/[id]                   │
     Dynamic Field                    (kind="booking_template")     │
        │                                  │                        │
        ▼                                  ▼                        │
   Export PNG / PDF              Compose layers including            │
   (saves to manasik:exports)    Dynamic Field placeholders          │
                                          │                          │
                                          ▼                          │
                                   (Future: render engine substitutes
                                    variables with real booking data)
```

---

## Admin Dashboard Overview

**There is no admin dashboard.** The app is single-role. All "admin-style" actions (manage products, delete projects, etc.) are available to the same operator from the regular UI.

If the user's request was about administrative *areas of the app*:
- **`/` (Home)** — primary list + project management.
- **`/templates`** — product catalogue management.
- **`/templates/[productId]`** — template provisioning per product.
- **`/pdf-tool`** — PDF assembly.
- **`/editor/[id]`** — design authoring.

All are operator-facing; no role gating exists.

---

## Configuration

### Environment Variables
| Variable                     | Where         | Purpose                                              |
|------------------------------|---------------|------------------------------------------------------|
| `EXPO_PACKAGER_PROXY_URL`    | `frontend/.env` | Expo dev/preview proxy URL (protected)             |
| `EXPO_PACKAGER_HOSTNAME`     | `frontend/.env` | Expo packager hostname (protected)                 |
| `EXPO_PUBLIC_BACKEND_URL`    | `frontend/.env` | Base URL the frontend uses to call `/api/*`        |
| `MONGO_URL`                  | `backend/.env` | Mongo connection string (protected, host = localhost) |
| `DB_NAME`                    | `backend/.env` | Mongo database name                                  |

### Build / Deploy Scripts (`frontend/package.json`)
| Script              | Purpose                                          |
|---------------------|--------------------------------------------------|
| `start`             | `expo start` for local dev                       |
| `web`               | `expo start --web`                               |
| `export:web`        | `expo export --platform web --output-dir dist` (Vercel build) |
| `build:apk`         | `eas build -p android --profile preview --non-interactive` |
| `build:apk:wait`    | Same + `--wait`                                  |
| `build:aab`         | Production Android App Bundle                    |

### Required Setup
- Node 18+, Yarn 1.22.x (locked via `packageManager` field).
- Expo SDK 54.
- For backend: Python 3.11+, MongoDB reachable at `MONGO_URL`.

### Important Dependencies (frontend)
- `react-native@0.81.5`, `react@19.1.0`, `expo@~54.0.35`
- `pdf-lib@1.17.1`, `html-to-image@1.11.13`, `react-native-view-shot@4.0.3`, `upng-js@2.1.0`
- `react-native-gesture-handler@~2.28.0`, `react-native-reanimated@~4.1.1`
- `idb-keyval@6.2.5`, `@react-native-async-storage/async-storage@2.2.0`
- `expo-file-system@~19.0.23` — **imported from `expo-file-system/legacy`** in `pdf-tool.tsx` to avoid the SDK 54 deprecation crash in release mode.

### Permissions Declared (Inferred — not modified in this session)
- iOS: `NSPhotoLibraryUsageDescription` (Image picker), `NSPhotoLibraryAddUsageDescription` (Save to gallery).
- Android: `READ_MEDIA_IMAGES`, `WRITE_EXTERNAL_STORAGE`.

---

## Security

### Authentication / Authorization
**None.** The app is a single-user offline tool and the FastAPI shell uses wide-open CORS.

### Input Validation
- Custom variable names in `VariablePickerModal` are validated against `/^[a-zA-Z_][a-zA-Z0-9_]*$/`.
- Canvas dimensions clamp to `50..6000` px in the AddProduct sheet and `20..min(canvas)` in `ImageFieldSizeModal`.
- Color HEX parsing rejects malformed input with a regex.

### Sensitive Operations
- Delete project / product / cell trigger `Alert.alert` confirmations with explicit "حذف" wording.
- No PII is stored anywhere yet; the booking-data render pipeline (where customer names / numbers would appear) is **not implemented**.

### Rate limiting
None. Not relevant to a local-only app.

### Future Considerations (Not Implemented)
- Cloud sync would require auth (queued: Google login via Emergent) and bucket access control (Cloudflare R2 or Images).

---

## Technical Notes (Reusable Utilities, Hooks, Shared Components)

### Shared Components
| Component                  | File                                                | Purpose                                             |
|----------------------------|-----------------------------------------------------|-----------------------------------------------------|
| `AspectRatioPicker`        | `src/components/AspectRatioPicker.tsx`              | Reusable preset / aspect ratio chooser              |
| `ColorPickerSheet`         | `src/components/ColorPickerSheet.tsx`               | Universal HSV color picker bottom sheet             |
| `CollageRenderer`          | `src/components/CollageRenderer.tsx`                | Shape-tree-driven multi-image renderer              |
| `CollageCellEditorModal`   | `src/components/CollageCellEditorModal.tsx`         | Cell editing with gesture pipeline                  |
| `LayerRenderer`            | `src/components/LayerRenderer.tsx`                  | Discriminated-union layer painter                   |
| `DraggableLayerList`       | `src/components/DraggableLayerList.tsx`             | Reorderable side drawer for layers                  |
| `ImageCropModal`           | `src/components/ImageCropModal.tsx`                 | Non-destructive crop UI                             |
| `SelectionBox`             | `src/components/SelectionBox.tsx`                   | Animated selection chrome around the active layer   |
| `brand-colors.ts`, `recent-colors.ts` | `src/components/`                          | Color palettes + recent-color persistence           |

### Hooks
- `useIconFonts` (`src/hooks/use-icon-fonts.ts`) — pre-warms the Ionicons font set so Android Expo Go doesn't render tofu placeholders.

### Utilities
- `theme.ts` — colors, radius, spacing, fonts, `isRTLText` (Arabic/Hebrew script detection).
- `kv-storage.ts` — see dedicated feature section.
- `collage-layouts.ts` — `LAYOUTS`, `SH` (raw shapes), `resolveLayout`, `walkShape`, `suggestLayout`, `gridFor`, `layoutsForCount`.
- `eyedropper-v2.ts` — `hasNativeEyeDropper`, `pickColor`.
- `eyedropper.ts` — legacy view-shot + upng-js pipeline retained as a native fallback.
- `editor/layer-utils.ts` — `ARABIC_SAFE_FONTS`, `COLOR_PALETTE`, `nextZIndex`, `buildTextLayer`, `buildImageLayer`, `buildShapeLayer`, `buildDynamicFieldLayer`, `cloneLayer`.

### Performance Notes
- **Layer renders** wrapped in `React.memo`.
- **Gesture handlers** use `useSharedValue` so 60 fps animation never bounces through React.
- **Selection box** uses `Animated.View` only — selection drag does not re-render the React tree.
- **Project autosave** debounced to avoid hammering kv-storage.

### State Management
Local component state + refs everywhere. No Redux/Zustand. The editor's `updateProject` reducer handles undo/redo and patch merging.

---

## Known Limitations (Aggregate)

1. **Cloud sync** is intentionally paused. All data lives on-device.
2. **Booking-data render engine** (substituting Dynamic Fields with real order data and exporting) is **not implemented yet**. The infrastructure (layer type, variables, product/template wiring) is ready.
3. **No dedicated DynamicFieldToolbar** — selected fields can be transformed and have their color changed (via the color picker), but `fontSize`, `textAlign`, etc. are not editable from a toolbar.
4. **Editor monolith**: `app/editor/[id].tsx` is ~3900 LOC. Refactor pending.
5. **PDF reorder on web** uses arrow buttons; native HTML5 DnD is not wired.
6. **Eyedropper on Chrome Android** falls back to `html-to-image`, which can sample dark/black if capture happens before paint.
7. **Custom font upload** queued as a future task.
8. **No thumbnails** auto-generated for project list cards.
9. **No multi-select** in any list (projects, products, exports).
10. **No tests** (unit / integration). Only manual + `testing_agent` runs.
11. **Backend status endpoint** is unused by the frontend.

---

## Future Improvements

- **Booking fulfilment engine**: walk a template's layers, replace `DynamicFieldLayer` placeholders with values from a booking payload, render to PNG (via existing capture pipeline), and serve from a `/api/render-booking` endpoint. Pair with the placeholder MongoDB layer.
- **Cloud sync** when ready: re-evaluate Cloudflare R2 vs Images, integrate Emergent Google Auth.
- **DynamicFieldToolbar**: typography toolbar mirroring the `TextToolbar` so operators can format placeholders without going through modals.
- **Test booking preview** on `/templates/[productId]`: small form (name, qty, date, image) that picks the correct template and renders the result inline.
- **Refactor `editor/[id].tsx`** into sub-components (`canvas/`, `toolbars/`, `modals/`) to reduce hook entanglement and re-render cost.
- **Auto-generated thumbnails**: hook into export pipeline to update `Project.thumbnail`.
- **Search & filter** for the projects list and templates list.
- **Bulk operations**: select multiple projects/products for delete/export.
- **Snap-to-grid + alignment guides** in the editor.
- **Pinch-to-zoom inside `ImageCropModal`**.

---

## Missing Documentation

The following pieces of code/functionality exist but could not be fully documented from the source alone:

| Item                                   | Why undocumented                                         |
|----------------------------------------|----------------------------------------------------------|
| `src/utils/storage/` folder            | Three files (`storage-base.ts`, `index.ts`, `index.web.ts`) duplicate part of the kv-storage role; only `kv-storage.ts` is actively imported by the store. Their original use is unclear — likely a legacy attempt before `kv-storage.ts` was introduced. **Inference**: dead/legacy code, candidate for removal. |
| `+html.tsx`                            | Custom web HTML wrapper for Expo Router Web — not inspected line-by-line; assumed to inject viewport / font preconnect tags (standard Expo template). |
| EAS build configuration                | `eas.json` (if any) was not inspected. The package scripts reference `--profile preview` and `--profile production`. |
| Vercel deployment configuration         | `vercel.json` mentioned in prior summaries but not opened in this session. **Inferred** to configure the `export:web` output as the deploy target. |
| Permissions in `app.json`              | Not opened in this session. Permissions strings inferred from `expo-image-picker` / `expo-media-library` usage. |
| Internal `ImageToolbar`, `TextToolbar`, `ShapeToolbar` exact controls | Defined inline within the monolithic `app/editor/[id].tsx`. The high-level capabilities are documented; per-button microcopy was not exhaustively enumerated. |
| Undo/redo internals                    | Implemented via local refs inside the editor; exact size cap not measured. |

---

*End of documentation.*
