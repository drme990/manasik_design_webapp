# Manasik Design App - Next.js Implementation Plan

> **Project**: تصميمات مناسك / Manasik Design App
> **Type**: Web-first design application with offline-first sync (Next.js + MongoDB)
> **Language**: Arabic (RTL) UI
> **Stack**: Next.js 16 · React 19 · TypeScript · Tailwind CSS · IndexedDB · MongoDB · Framer Motion
> **Target**: Modern web browsers (Chrome, Edge, Safari, Firefox)
> **Last updated**: July 9, 2026

---

## Project Overview

### Purpose
A single-user, offline-first design editor with cloud sync tailored for the مناسك Foundation's marketing operators. It lets non-designers compose Arabic posters, story templates, posts, and PDFs from a web browser, and authors fill-in-the-blanks **booking templates** that will later be auto-generated for every customer order.

### Key Architecture: Offline-First with MongoDB Sync
- **Local Storage**: IndexedDB for immediate offline access
- **Cloud Storage**: MongoDB as source of truth and backup
- **Sync Service**: Background synchronization when online
- **Operation Queue**: Queue offline operations for later sync
- **Conflict Resolution**: Automatic and manual conflict handling

### Who Uses It
- **Admins** — authenticated operators with the same admin user shape as the backend (`admin` or `super_admin` role, optional `allowedPages`, and `ref`).
- **Operators** create/edit designs, build booking templates, export PNG/PDF after logging in.
- **(Future)** A booking pipeline will inflate templates with order data; no end-customer role exists today.

### Distribution
- **Web** deployed to Vercel (or any Node.js hosting platform)
- **PWA** capabilities for offline usage
- **MongoDB Atlas** for cloud storage

---

## Tech Stack Migration

### From React Native to Next.js

| React Native Component | Next.js/Web Equivalent |
|----------------------|------------------------|
| `expo-router` | Next.js App Router |
| `react-native-gesture-handler` | Framer Motion gestures |
| `react-native-reanimated` | Framer Motion animations |
| `AsyncStorage` | IndexedDB (via idb-keyval) + MongoDB sync |
| `expo-image` | HTML `<img>` with object-fit |
| `react-native-svg` | lucide-react / react-icons |
| `expo-image-picker` | HTML file input + FileReader |
| `react-native-view-shot` | html-to-image / dom-to-image |
| `expo-file-system` | File API + Blob |
| `FastAPI` backend | Next.js API routes + MongoDB |

### Core Technologies

- **Framework**: Next.js 16 (App Router)
- **UI**: React 19 + TypeScript
- **Styling**: Tailwind CSS + CSS Modules
- **Animations**: Framer Motion
- **State**: React Context + Hooks (Zustand optional)
- **Local Storage**: IndexedDB (idb) for offline-first
- **Cloud Storage**: MongoDB (MongoDB Atlas) for sync and backup
- **Sync Service**: Custom sync service with operation queue
- **Authentication**: bcryptjs + HS256 JWT + HTTP-only cookies
- **Image Processing**: html-to-image, pdf-lib
- **Icons**: lucide-react / react-icons
- **Fonts**: Next.js font optimization (Google Fonts)
- **Network**: Online/offline detection with Network API

---

## Architecture Overview

```
/
├── app/                          # Next.js App Router
│   ├── layout.tsx               # Root layout with fonts, RTL, providers
│   ├── page.tsx                 # Internal redirect only (not a user-facing page)
│   ├── login/
│   │   └── page.tsx             # Admin login page
│   ├── api/
│   │   └── auth/
│   │       └── login/
│   │           └── route.ts     # Login API route
│   ├── (design)/
│   │   ├── layout.tsx           # Protected design layout (requires session)
│   │   ├── projects/
│   │   │   └── page.tsx         # Main design page — recent projects list
│   │   ├── pdf-tool/
│   │   │   └── page.tsx         # PDF assembly tool
│   │   ├── editor/
│   │   │   └── [id]/
│   │   │       └── page.tsx     # Design editor
│   │   └── templates/
│   │       ├── page.tsx         # Product list (Booking Templates)
│   │       └── [productId]/
│   │           └── page.tsx     # 6 templates per product
├── components/
│   ├── ui/                      # Reusable UI components (buttons, inputs, etc.)
│   ├── editor/                  # Editor-specific components
│   │   ├── Canvas.tsx           # Main canvas area
│   │   ├── LayerRenderer.tsx   # Layer rendering logic
│   │   ├── SelectionBox.tsx    # Selection handles
│   │   ├── Toolbars/           # Contextual toolbars
│   │   └── Modals/             # Editor modals (crop, color, etc.)
│   ├── common/                 # Shared components
│   │   ├── ColorPicker.tsx     # HSV color picker
│   │   ├── AspectRatioPicker.tsx
│   │   ├── ImageCropModal.tsx
│   │   └── CollageRenderer.tsx
│   ├── sync/                   # Sync-related components
│   │   ├── SyncStatus.tsx      # Sync status indicator
│   │   ├── ConflictDialog.tsx  # Conflict resolution dialog
│   │   └── OfflineBanner.tsx    # Offline notification
│   └── layout/                 # Layout components
│       ├── Header.tsx
│       ├── Sidebar.tsx
│       └── Footer.tsx
├── lib/
│   ├── auth/                   # Authentication & authorization
│   │   ├── actions.ts          # Server actions (logout)
│   │   ├── constants.ts        # Auth cookie name & max age
│   │   ├── jwt.ts              # HS256 JWT signing/verification
│   │   ├── password.ts         # bcrypt password hashing/comparison
│   │   ├── session.ts          # Cookie-based session verification
│   │   └── user.repository.ts  # Admin user lookup in MongoDB
│   ├── store/                  # State management
│   │   ├── projects.ts         # Project CRUD with sync
│   │   ├── booking-templates.ts
│   │   └── exports.ts
│   ├── sync/                   # Sync service
│   │   ├── sync-service.ts     # Main sync orchestrator
│   │   ├── sync-queue.ts       # Operation queue management
│   │   ├── conflict-resolver.ts # Conflict resolution logic
│   │   └── network-monitor.ts  # Online/offline detection
│   ├── db/                     # Database layer
│   │   ├── indexeddb.ts        # IndexedDB operations
│   │   ├── mongodb.ts          # MongoDB client
│   │   └── repositories/       # Data access layer
│   │       ├── projects.repository.ts
│   │       ├── booking.repository.ts
│   │       └── exports.repository.ts
│   ├── utils/
│   │   ├── kv-storage.ts       # IndexedDB wrapper
│   │   ├── canvas-utils.ts     # Canvas helper functions
│   │   ├── image-utils.ts      # Image processing
│   │   ├── pdf-utils.ts        # PDF generation
│   │   └── eyedropper.ts       # Color picking
│   ├── hooks/
│   │   ├── use-gestures.ts     # Custom gesture hooks
│   │   ├── use-keyboard.ts     # Keyboard shortcuts
│   │   └── use-undo-redo.ts    # Undo/redo logic
│   └── constants/
│       ├── brand-colors.ts
│       ├── fonts.ts
│       └── presets.ts
├── types/
│   ├── auth.ts                 # User and session types (matches backend admin user)
│   ├── project.ts              # Project and layer types with sync fields
│   ├── booking.ts              # Booking template types with sync fields
│   ├── common.ts               # Shared types with sync fields
│   ├── storage.ts              # Storage and sync types
│   └── sync.ts                 # Sync service types
├── scripts/
│   └── seed-user.ts            # Seed/update admin user in users_admin_panel
└── public/
    ├── fonts/                  # Custom fonts
    └── assets/                 # Static assets
```

---

## Sync Architecture

### Data Flow

```
User Action → IndexedDB (immediate) → Sync Queue (if offline) → MongoDB (when online)
MongoDB Changes → Sync Service → IndexedDB (update local cache)
```

### Key Components

#### 1. **Local Storage (IndexedDB)**
- Primary storage for immediate access
- Stores all documents with sync metadata
- Works completely offline
- Fast read/write operations

#### 2. **Cloud Storage (MongoDB)**
- Source of truth and backup
- Cross-device synchronization
- Data persistence and recovery
- Supports future collaboration features

#### 3. **Sync Service**
- Background synchronization when online
- Bidirectional sync (local ↔ remote)
- Conflict detection and resolution
- Retry logic for failed operations

#### 4. **Operation Queue**
- Queues operations when offline
- Processes queue when connection restored
- Exponential backoff for retries
- Operation deduplication

#### 5. **Network Monitor**
- Detects online/offline status
- Triggers sync on connection restore
- Pauses sync when offline
- Shows connection status to users

### Sync Strategy

#### **Optimistic UI**
- All updates appear immediately (local)
- No waiting for server confirmation
- Background sync processes changes
- Error handling with rollback if needed

#### **Conflict Resolution**
- **Automatic**: Last-write-wins based on timestamp
- **Manual**: User chooses between versions
- **Merge**: Smart merge for compatible changes
- **Versioning**: Track document revisions

#### **Sync Metadata**
Each document includes:
- `syncStatus`: 'synced' | 'pending' | 'conflict' | 'error'
- `localModifiedAt`: Last local modification time
- `syncedAt`: Last successful sync time
- `_rev`: Document revision for conflict detection

### Offline Capabilities

- ✅ Full CRUD operations offline
- ✅ Project creation and editing
- ✅ Image uploads (local storage)
- ✅ PDF generation
- ✅ Export functionality
- ✅ Queue operations for later sync

### Online Capabilities

- ✅ Automatic background sync
- ✅ Cloud backup
- ✅ Cross-device access
- ✅ Conflict resolution
- ✅ Real-time updates (future)

---

## Key Features Implementation

### 1. Project Management (Main Design Page & Persistence)

**Implementation:**
- `app/page.tsx` is an internal redirect only; users never see a landing/home screen.
- The main user-facing entry point is the **Recent Projects** page (`app/projects/page.tsx`):
  - Grid of recently saved designs/projects
  - Quick "New Project" action with presets (Square 1080×1080, Story 1080×1920, Post 1200×1500)
  - Links to open existing designs in the editor
- Project CRUD operations via IndexedDB
- Aspect ratio picker
- Image-derived sizing

**Web Adaptations:**
- Use File System Access API for better file handling (where supported)
- Drag-and-drop for image uploads
- LocalStorage fallback for small data, IndexedDB for projects

### 2. Design Editor — Canvas & Selection

**Implementation:**
- Main canvas using HTML5 Canvas or SVG-based rendering
- Framer Motion for gestures (pan, zoom, rotate)
- Layer system with discriminated union types
- Selection box with transform handles
- Undo/redo with history stack
- Contextual toolbars based on selection type

**Web Adaptations:**
- Mouse and touch event handling
- Keyboard shortcuts (Ctrl+Z, Delete, Arrow keys)
- Canvas-based rendering for performance
- CSS transforms for smooth animations

### 3. Text Layers

**Implementation:**
- RTL text detection and rendering
- Font family selection (Arabic-safe fonts)
- Font size, color, alignment controls
- Bold/italic toggles
- Line height adjustment
- Text wrapping with optional box width

**Web Adaptations:**
- Use CSS `direction: rtl` for Arabic text
- Google Fonts integration (Tajawal, IBM Plex Sans Arabic)
- CSS `writing-mode` for text orientation
- `contenteditable` for inline text editing

### 4. Image Layers (Mask + Frame)

**Implementation:**
- Image upload via file input or drag-and-drop
- Mask shapes (rectangle, rounded rectangle, circle)
- Frame border with color picker
- Flip X/Y transformations
- Image cropping with rule-of-thirds guides

**Web Adaptations:**
- `<input type="file" accept="image/*">` for image selection
- CSS `border-radius` for mask shapes
- CSS `object-fit` for image positioning
- Canvas-based cropping interface

### 5. Shape Layers

**Implementation:**
- SVG-based shape rendering
- Shape types: rectangle, circle, triangle, star, line
- Fill and stroke controls
- Corner radius for rectangles

**Web Adaptations:**
- Native SVG support
- CSS `border-radius` for rounded rectangles
- SVG `<polygon>` for triangles and stars

### 6. Multi-image Collage

**Implementation:**
- 19 layout presets (grid and asymmetric)
- Shape-tree layout descriptor
- Per-cell editing (pan, zoom, replace)
- Auto-layout suggestions

**Web Adaptations:**
- CSS Grid for layout rendering
- Framer Motion for drag-and-drop reordering
- Canvas-based cell editing

### 7. HSV Color Picker

**Implementation:**
- HSV color space picker
- Hue slider and saturation/value square
- HEX and RGB input fields
- Brand colors palette
- Recent colors tracking
- Eyedropper integration

**Web Adaptations:**
- Native `<input type="color">` as fallback
- Canvas-based HSV picker
- CSS custom properties for color management

### 8. Eyedropper Tool

**Implementation:**
- Native `EyeDropper` API (Chrome/Edge/Safari 17+)
- Canvas-based fallback for other browsers
- Pixel sampling from canvas

**Web Adaptations:**
- Feature detection for `EyeDropper` API
- `html-to-image` for canvas capture
- Canvas `getImageData` for pixel sampling

### 9. PDF Tool

**Implementation:**
- Multi-page PDF assembly
- Image reordering (drag-and-drop)
- A4 page sizing
- PDF generation with pdf-lib

**Web Adaptations:**
- HTML5 Drag and Drop API
- PDF download via Blob
- Print-to-PDF fallback option

### 10. Product Booking Templates

**Implementation:**
- Product management (CRUD)
- 2 models × 3 variants = 6 templates per product
- Dynamic field layers with variable binding
- Template provisioning system

**Web Adaptations:**
- Same data structure as React Native
- IndexedDB for local persistence
- MongoDB for cloud sync
- Web-based editor interface

### 11. Dynamic Field Layers

**Implementation:**
- Placeholder text with variable binding
- Variable picker (predefined + custom)
- Image field sizing
- Future render engine integration

**Web Adaptations:**
- CSS-based placeholder styling
- Form input for variable names
- Template literal substitution

### 12. Sync Service

**Implementation:**
- Background sync when online
- Operation queue for offline changes
- Conflict detection and resolution
- Network status monitoring
- Sync status indicators

**Features:**
- Automatic sync on connection restore
- Manual sync trigger
- Conflict resolution UI
- Sync history and metrics
- Offline mode indicator

---

## Authentication & Authorization

The app shares the same admin user collection and password hashing as the backend (`users_admin_panel` in the database named by the MongoDB connection string), so admin users created in the backend can log in here and vice versa.

### User Shape (matches backend admin user)

```typescript
interface User {
  _id?: string;                    // MongoDB ObjectId
  name: string;
  email: string;
  password: string;                // bcrypt hash
  role: 'admin' | 'super_admin';
  allowedPages?: string[];         // Page-level permissions (same enum as backend)
  ref?: string;                    // Reference/affiliate code
  createdAt?: Date;
  updatedAt?: Date;
}

interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'super_admin';
  allowedPages?: string[];
  ref?: string;
}
```

### Password Hashing

- Uses `bcryptjs` with `bcrypt.genSalt(10)` and `bcrypt.hash()`, identical to the backend user schema.
- Helper: `lib/auth/password.ts` provides `hashPassword()` and `comparePassword()`.
- Replaces the previous SHA-256 `passwordHash` field; documents now store the bcrypt hash in the `password` field.

### Login Flow

1. User submits email/password on `app/login/page.tsx`.
   - The login page UI mirrors the admin panel login page (card layout, controlled inputs, password show/hide toggle, login icon button, error banner) but uses a Manasik Design-specific title. Icons are rendered with `react-icons/lu` to match the admin panel exactly.
2. `POST /api/auth/login`:
   - Looks up the user by lowercase email in `users_admin_panel`.
   - Verifies the password with `bcrypt.compare`.
   - Signs a JWT containing `id`, `email`, `name`, `role`, `allowedPages`, and `ref`.
   - Sets the HTTP-only cookie `manasik_design_session`.
3. Server components verify the session via `lib/auth/session.ts` → `verifySession()`.
4. Protected routes (e.g., `app/(design)/layout.tsx`) redirect to `/login` when the session is missing.

### JWT & Session

- Algorithm: HS256, signed with `JWT_SECRET`.
- Token lifetime: 7 days.
- Cookie: `manasik_design_session`, `httpOnly`, `secure` in production, `sameSite: 'lax'`, `path: '/'`.
- Logout server action: `lib/auth/actions.ts` calls `destroySession()` to clear the cookie.

### Seeding an Admin User

```bash
npx tsx scripts/seed-user.ts admin@example.com password "Admin Name"
```

This creates/updates a `super_admin` user with bcrypt-hashed password in `users_admin_panel`.

### Migration Notes

- Old users seeded with SHA-256 (`passwordHash` field) cannot log in after this change; re-seed them with the updated script.
- Existing sessions are invalidated because the cookie name changed from `desing_app_session` / `manasik_session` to `manasik_design_session`.

---

## Data Structure & Storage

### IndexedDB Schema (Local Storage)

```typescript
// Projects (with sync metadata)
interface Project {
  id: string;
  _id?: string; // MongoDB ObjectId
  name: string;
  kind: "design" | "booking_template";
  canvasWidth: number;
  canvasHeight: number;
  backgroundUri?: string;
  layers: AnyLayer[];
  thumbnail?: string;
  createdAt: number;
  updatedAt: number;
  localModifiedAt: number;
  syncStatus: 'synced' | 'pending' | 'conflict' | 'error';
  syncedAt?: number;
  bookingMeta?: {
    productId: string;
    model: "withImage" | "withoutImage";
    variant: "single" | "double" | "multiple";
  };
}

// Booking Products (with sync metadata)
interface BookingProduct {
  id: string;
  _id?: string; // MongoDB ObjectId
  name: string;
  imageUri?: string;
  createdAt: number;
  updatedAt: number;
  localModifiedAt: number;
  syncStatus: 'synced' | 'pending' | 'conflict' | 'error';
  syncedAt?: number;
  defaultCanvas: {
    width: number;
    height: number;
    backgroundUri?: string;
  };
  templates: {
    withImage: {
      single: string | null;
      double: string | null;
      multiple: string | null;
    };
    withoutImage: {
      single: string | null;
      double: string | null;
      multiple: string | null;
    };
  };
}

// PDF Projects (with sync metadata)
interface PdfProject {
  id: string;
  _id?: string; // MongoDB ObjectId
  name: string;
  images: string[];
  pdfUri?: string;
  createdAt: number;
  updatedAt: number;
  localModifiedAt: number;
  syncStatus: 'synced' | 'pending' | 'conflict' | 'error';
  syncedAt?: number;
}

// Exports (with sync metadata)
interface ExportedItem {
  id: string;
  _id?: string; // MongoDB ObjectId
  projectId?: string;
  uri: string;
  type: "png" | "pdf";
  createdAt: number;
  localModifiedAt: number;
  syncStatus: 'synced' | 'pending' | 'conflict' | 'error';
  syncedAt?: number;
}

// Sync Queue
interface SyncOperation {
  id: string;
  type: 'create' | 'update' | 'delete';
  collection: string;
  documentId: string;
  data: any;
  timestamp: number;
  retryCount: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error?: string;
}

// Sync State
interface SyncState {
  lastSyncAt: number | null;
  isOnline: boolean;
  isSyncing: boolean;
  pendingOperations: number;
  conflicts: number;
  lastError?: string;
}
```

### Storage Keys

| Key | Type | Description |
|-----|------|-------------|
| `manasik:projects` | `Project[]` | All projects (design + booking) with sync metadata |
| `manasik:exports` | `ExportedItem[]` | Last 30 exports with sync metadata |
| `manasik:pdf_projects` | `PdfProject[]` | PDF assembly projects with sync metadata |
| `manasik:booking_products` | `BookingProduct[]` | Product definitions with sync metadata |
| `manasik:recent_colors` | `string[]` | Last 12 used colors |
| `manasik:sync-queue` | `SyncOperation[]` | Queued sync operations |
| `manasik:sync-state` | `SyncState` | Current sync state |

### MongoDB Schema (Cloud Storage)

```typescript
// Projects Collection
db.projects {
  _id: ObjectId;
  id: string; // Same as local ID
  name: string;
  kind: "design" | "booking_template";
  canvasWidth: number;
  canvasHeight: number;
  backgroundUri?: string;
  layers: AnyLayer[];
  thumbnail?: string;
  createdAt: number;
  updatedAt: number;
  localModifiedAt: number;
  syncStatus: 'synced' | 'pending' | 'conflict' | 'error';
  syncedAt?: number;
  bookingMeta?: { ... };
  userId?: string;
  _rev: string; // Revision for conflict detection
}

// Users Collection (shared with backend admin panel)
db.users_admin_panel {
  _id: ObjectId;
  name: string;
  email: string; // lowercase, unique
  password: string; // bcrypt hash
  role: 'admin' | 'super_admin';
  allowedPages?: string[]; // page-level permissions
  ref?: string; // reference/affiliate code
  createdAt: Date;
  updatedAt: Date;
}

// Similar structure for other collections
```

---

## UI/UX Considerations

### RTL Support
- Global `dir="rtl"` attribute on `<html>` tag
- CSS logical properties (`margin-inline-start` instead of `margin-left`)
- Tailwind's `rtl:` modifiers
- Proper text alignment for Arabic content

### Responsive Design
- Mobile-first approach
- Breakpoints: sm (640px), md (768px), lg (1024px), xl (1280px)
- Touch-friendly UI (minimum 44px tap targets)
- Adaptive layouts for different screen sizes

### Performance
- Code splitting via Next.js dynamic imports
- Image optimization with next/image
- Lazy loading for heavy components
- Debounced autosave
- Canvas rendering for complex graphics

### Accessibility
- ARIA labels for interactive elements
- Keyboard navigation support
- Focus management in modals
- Color contrast compliance (WCAG AA)
- Screen reader support

---

## Implementation Phases

### Phase 1: Foundation (Week 1-2)
- [ ] Set up Next.js project with TypeScript
- [ ] Configure Tailwind CSS with RTL support
- [ ] Set up IndexedDB storage layer
- [ ] Create base layout with fonts and theme
- [ ] Implement routing structure
- [ ] Create basic UI component library

### Phase 2: Core Editor (Week 3-4)
- [ ] Implement canvas rendering engine
- [ ] Build layer system and rendering
- [ ] Add selection and transform handles
- [ ] Implement gesture handling (pan, zoom, rotate)
- [ ] Create undo/redo system
- [ ] Add basic toolbars

### Phase 3: Layer Types (Week 5-6)
- [ ] Text layer with RTL support
- [ ] Image layer with masking
- [ ] Shape layer system
- [ ] Image cropping functionality
- [ ] Color picker integration
- [ ] Layer management (reorder, lock, hide)

### Phase 4: Advanced Features (Week 7-8)
- [ ] Multi-image collage system
- [ ] Collage cell editor
- [ ] Eyedropper tool
- [ ] PDF generation
- [ ] Export functionality (PNG/PDF)
- [ ] PDF assembly tool

### Phase 5: Booking Templates (Week 9-10)
- [ ] Product management
- [ ] Template provisioning
- [ ] Dynamic field layers
- [ ] Variable binding system
- [ ] Template editor integration

### Phase 6: Sync Service (Week 11-12)
- [ ] MongoDB integration and setup
- [ ] Sync service implementation
- [ ] Operation queue management
- [ ] Network monitoring
- [ ] Conflict resolution system
- [ ] Sync status UI components
- [ ] Background sync triggers
- [ ] Sync metrics and monitoring

### Phase 7: Polish & Optimization (Week 13-14)
- [ ] Performance optimization
- [ ] PWA configuration
- [ ] Offline support testing
- [ ] Error handling
- [ ] User testing feedback
- [ ] Documentation

---

## Dependencies

### Core
```json
{
  "next": "^14.0.0",
  "react": "^18.0.0",
  "react-dom": "^18.0.0",
  "typescript": "^5.0.0"
}
```

### UI & Styling
```json
{
  "tailwindcss": "^3.4.0",
  "framer-motion": "^11.0.0",
  "lucide-react": "^0.300.0",
  "clsx": "^2.0.0",
  "tailwind-merge": "^2.0.0"
}
```

### Storage & Data
```json
{
  "idb-keyval": "^6.2.0",
  "zustand": "^4.4.0",
  "mongodb": "^6.0.0",
  "bson": "^6.0.0"
}
```

### Authentication
```json
{
  "bcryptjs": "^3.0.3",
  "react-icons": "^5.7.0"
}
```

### Sync & Network
```json
{
  "dexie": "^3.2.0",
  "dexie-observable": "^0.0.3"
}
```

### Image & PDF Processing
```json
{
  "html-to-image": "^1.11.0",
  "pdf-lib": "^1.17.0",
  "file-saver": "^2.0.5"
}
```

### Utilities
```json
{
  "date-fns": "^3.0.0",
  "uuid": "^9.0.0"
}
```

---

## Configuration Files

### next.config.js
```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: ['localhost'],
    unoptimized: true,
  },
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },
};

module.exports = nextConfig;
```

### tailwind.config.ts
```typescript
import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f0f9ff',
          100: '#e0f2fe',
          500: '#0ea5e9',
          600: '#0284c7',
          700: '#0369a1',
        },
      },
      fontFamily: {
        arabic: ['Tajawal', 'IBM Plex Sans Arabic', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
```

---

## Deployment

### Vercel (Recommended)
- Connect GitHub repository
- Configure build settings:
  - Build Command: `npm run build`
  - Output Directory: `.next`
  - Install Command: `npm install`
- Environment variables (see below)
- Automatic deployments on push

### MongoDB Atlas Setup
- Create MongoDB Atlas account
- Create a new cluster (free tier available)
- Create database user with read/write permissions
- Whitelist IP addresses (0.0.0.0/0 for Vercel)
- Get connection string
- Make sure the connection string includes the **same database name as the backend** (e.g. `manasik`) so the `users_admin_panel` collection is shared
- Set environment variable `MONGODB_URI`

### Environment Variables
```env
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/manasik
JWT_SECRET=your-super-secret-jwt-signing-key
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app
```

### Alternative Platforms
- Netlify
- AWS Amplify
- Self-hosted (Node.js server)

---

## Security Considerations

- Input validation for all user inputs
- Sanitize HTML content (if using rich text)
- Content Security Policy (CSP) headers
- HTTPS only in production
- MongoDB connection string security (environment variables)
- MongoDB Atlas network access control
- MongoDB user authentication
- Rate limiting for API routes
- No sensitive data in localStorage
- Passwords hashed with bcrypt (salt rounds 10)
- JWT sessions stored in HTTP-only cookies
- Protected routes redirect unauthenticated users to login
- Sync data encryption (future)
- Page-level authorization via `allowedPages` (future enforcement)

---

## Browser Support

- Chrome/Edge: 90+ (full support)
- Safari: 14+ (full support)
- Firefox: 88+ (full support)
- Mobile browsers: iOS Safari 14+, Chrome Android 90+

### Progressive Enhancement
- Graceful degradation for older browsers
- Feature detection for modern APIs
- Fallback UIs for unsupported features

---

## Testing Strategy

### Unit Tests
- Jest + React Testing Library
- Test utility functions
- Test component rendering
- Test state management

### Integration Tests
- Playwright for E2E testing
- Test user flows
- Test cross-browser compatibility
- Test offline functionality

### Manual Testing
- RTL layout verification
- Arabic text rendering
- Touch gesture testing
- Performance testing on various devices

---

## Performance Targets

- First Contentful Paint: < 1.5s
- Time to Interactive: < 3.5s
- Canvas rendering: 60fps
- Project save: < 500ms (local)
- Sync operation: < 2s (typical document)
- Image export: < 2s (typical design)
- Offline to online sync: < 10s (queue processing)

---

## Future Enhancements

### Phase 2+ Features
- [x] Cloud sync with MongoDB (Phase 6)
- [ ] Real-time collaboration
- [ ] Advanced AI tools
- [ ] Custom font upload
- [ ] Template marketplace
- [ ] Advanced export options
- [ ] Video export support
- [ ] Animation timeline
- [x] User authentication (admin login with backend-aligned user shape)
- [ ] Multi-tenancy and page-level authorization enforcement
- [ ] Advanced conflict resolution UI
- [ ] Sync analytics and monitoring
- [ ] Selective sync (per project/collection)

### Technical Debt
- [ ] Split monolithic editor into smaller components
- [ ] Add comprehensive test coverage
- [ ] Implement error boundary system
- [ ] Add analytics (privacy-focused)
- [ ] Optimize bundle size
- [ ] Add sync performance monitoring
- [ ] Implement sync retry strategies

---

## Success Criteria

1. **Functional Parity**: All features from React Native version work in web
2. **Performance**: Smooth 60fps canvas interactions
3. **Offline Support**: Full functionality without internet
4. **Cloud Sync**: Reliable sync with MongoDB when online
5. **Conflict Resolution**: Handle sync conflicts gracefully
6. **RTL Support**: Proper Arabic text rendering and layout
7. **Cross-Browser**: Works on all major browsers
8. **Mobile Friendly**: Responsive design works on mobile devices
9. **Export Quality**: PNG/PDF exports match original design
10. **Data Persistence**: Reliable IndexedDB storage with MongoDB backup

---

## Sync Service Implementation Details

### Core Components

#### 1. **Sync Service** (`lib/sync/sync-service.ts`)
```typescript
class SyncService {
  // Main sync orchestrator
  async sync(): Promise<SyncResult>
  async syncCollection(collection: string): Promise<void>
  async syncDocument(collection: string, id: string): Promise<void>
  private handleConflict(document: any): Promise<void>
  private applyRemoteChanges(document: any): Promise<void>
  private queueLocalChanges(document: any): Promise<void>
}
```

#### 2. **Sync Queue** (`lib/sync/sync-queue.ts`)
```typescript
class SyncQueue {
  // Operation queue management
  async add(operation: SyncOperation): Promise<void>
  async process(): Promise<void>
  async retryFailed(): Promise<void>
  async clear(): Promise<void>
  private shouldRetry(operation: SyncOperation): boolean
}
```

#### 3. **Conflict Resolver** (`lib/sync/conflict-resolver.ts`)
```typescript
class ConflictResolver {
  // Conflict resolution strategies
  async resolve(conflict: DocumentDelta): Promise<any>
  private autoResolve(local: any, remote: any): any
  private mergeChanges(local: any, remote: any): any
  private requiresManualResolution(local: any, remote: any): boolean
}
```

#### 4. **Network Monitor** (`lib/sync/network-monitor.ts`)
```typescript
class NetworkMonitor {
  // Online/offline detection
  startMonitoring(): void
  stopMonitoring(): void
  isOnline(): boolean
  onStatusChange(callback: (online: boolean) => void): void
}
```

### Sync Flow

#### **Online Sync**
1. User makes changes → Update IndexedDB (immediate)
2. Mark document as `syncStatus: 'pending'`
3. Add operation to sync queue
4. Background sync processes queue
5. Update MongoDB
6. Mark document as `syncStatus: 'synced'`
7. Update `syncedAt` timestamp

#### **Offline Sync**
1. User makes changes → Update IndexedDB (immediate)
2. Mark document as `syncStatus: 'pending'`
3. Add operation to sync queue
4. Queue persists in IndexedDB
5. When connection restored:
   - Process queued operations
   - Sync with MongoDB
   - Handle any conflicts

#### **Conflict Detection**
1. Compare `localModifiedAt` vs remote `updatedAt`
2. Check `_rev` (revision) mismatch
3. If conflict detected:
   - Mark document as `syncStatus: 'conflict'`
   - Store both versions
   - Show conflict resolution UI
   - Apply user's resolution choice

### Sync Configuration

```typescript
const SYNC_CONFIG: SyncConfig = {
  enabled: true,
  syncInterval: 30000, // 30 seconds
  retryInterval: 5000, // 5 seconds
  maxRetries: 3,
  conflictResolution: 'manual' // 'local' | 'remote' | 'manual'
};
```

### API Routes (Next.js)

#### **Sync Endpoint**
```typescript
// app/api/sync/route.ts
export async function POST(request: Request) {
  // Handle sync requests from client
  // Return changed documents since last sync
}
```

#### **Document Endpoints**
```typescript
// app/api/projects/route.ts
// app/api/booking-products/route.ts
// app/api/exports/route.ts
// CRUD operations with sync support
```

---

## Notes

- This is a web-first adaptation of the React Native app
- Maintain the same data structure for compatibility
- Prioritize performance and user experience
- Keep the codebase clean and maintainable
- Follow Next.js best practices
- Ensure proper TypeScript typing throughout
- Document components and complex logic
- Use semantic HTML for accessibility
- Test thoroughly across browsers and devices