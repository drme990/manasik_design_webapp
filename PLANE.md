# Manasik Design App - Next.js Implementation Plan

> **Project**: تصميمات مناسك / Manasik Design App
> **Type**: Web-first design application (Next.js)
> **Language**: Arabic (RTL) UI
> **Stack**: Next.js 14 · React 18 · TypeScript · Tailwind CSS · IndexedDB · Framer Motion
> **Target**: Modern web browsers (Chrome, Edge, Safari, Firefox)
> **Last updated**: July 2026

---

## Project Overview

### Purpose
A single-user, offline-first design editor tailored for the مناسك Foundation's marketing operators. It lets non-designers compose Arabic posters, story templates, posts, and PDFs from a web browser, and authors fill-in-the-blanks **booking templates** that will later be auto-generated for every customer order.

### Who Uses It
- **Operators** (single role) — create/edit designs, build booking templates, export PNG/PDF.
- **(Future)** A booking pipeline will inflate templates with order data; no end-customer role exists today.

### Distribution
- **Web** deployed to Vercel (or any Node.js hosting platform)
- **PWA** capabilities for offline usage

---

## Tech Stack Migration

### From React Native to Next.js

| React Native Component | Next.js/Web Equivalent |
|----------------------|------------------------|
| `expo-router` | Next.js App Router |
| `react-native-gesture-handler` | Framer Motion gestures |
| `react-native-reanimated` | Framer Motion animations |
| `AsyncStorage` | IndexedDB (via idb-keyval) |
| `expo-image` | HTML `<img>` with object-fit |
| `react-native-svg` | lucide-react / react-icons |
| `expo-image-picker` | HTML file input + FileReader |
| `react-native-view-shot` | html-to-image / dom-to-image |
| `expo-file-system` | File API + Blob |
| `FastAPI` backend | Next.js API routes (optional) |

### Core Technologies

- **Framework**: Next.js 14 (App Router)
- **UI**: React 18 + TypeScript
- **Styling**: Tailwind CSS + CSS Modules
- **Animations**: Framer Motion
- **State**: React Context + Hooks (Zustand optional)
- **Storage**: IndexedDB (idb-keyval) for offline-first
- **Image Processing**: html-to-image, pdf-lib
- **Icons**: lucide-react / react-icons
- **Fonts**: Next.js font optimization (Google Fonts)

---

## Architecture Overview

```
/
├── app/                          # Next.js App Router
│   ├── layout.tsx               # Root layout with fonts, RTL, providers
│   ├── page.tsx                 # Home screen
│   ├── pdf-tool/
│   │   └── page.tsx             # PDF assembly tool
│   ├── editor/
│   │   └── [id]/
│   │       └── page.tsx         # Design editor
│   └── templates/
│       ├── page.tsx             # Product list (Booking Templates)
│       └── [productId]/
│           └── page.tsx         # 6 templates per product
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
│   └── layout/                 # Layout components
│       ├── Header.tsx
│       ├── Sidebar.tsx
│       └── Footer.tsx
├── lib/
│   ├── store/                  # State management
│   │   ├── projects.ts         # Project CRUD
│   │   ├── booking-templates.ts
│   │   └── exports.ts
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
│   ├── project.ts              # Project and layer types
│   ├── booking.ts              # Booking template types
│   └── common.ts               # Shared types
└── public/
    ├── fonts/                  # Custom fonts
    └── assets/                 # Static assets
```

---

## Key Features Implementation

### 1. Project Management (Home & Persistence)

**Implementation:**
- Home screen (`app/page.tsx`) with three sections:
  - Recent gallery images (using File System Access API or `<input type="file">`)
  - Quick tools (PDF & Booking Templates)
  - Saved projects
- Project CRUD operations via IndexedDB
- New project creation with presets (Square 1080×1080, Story 1080×1920, Post 1200×1500)
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
- IndexedDB for persistence
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

---

## Data Structure & Storage

### IndexedDB Schema

```typescript
// Projects
interface Project {
  id: string;
  name: string;
  kind: "design" | "booking_template";
  canvasWidth: number;
  canvasHeight: number;
  backgroundUri?: string;
  layers: AnyLayer[];
  thumbnail?: string;
  createdAt: number;
  updatedAt: number;
  bookingMeta?: {
    productId: string;
    model: "withImage" | "withoutImage";
    variant: "single" | "double" | "multiple";
  };
}

// Booking Products
interface BookingProduct {
  id: string;
  name: string;
  imageUri?: string;
  createdAt: number;
  updatedAt: number;
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

// PDF Projects
interface PdfProject {
  id: string;
  name: string;
  images: string[];
  pdfUri?: string;
  createdAt: number;
  updatedAt: number;
}

// Exports
interface ExportedItem {
  id: string;
  projectId?: string;
  uri: string;
  type: "png" | "pdf";
  createdAt: number;
}
```

### Storage Keys

| Key | Type | Description |
|-----|------|-------------|
| `manasik:projects` | `Project[]` | All projects (design + booking) |
| `manasik:exports` | `ExportedItem[]` | Last 30 exports |
| `manasik:pdf_projects` | `PdfProject[]` | PDF assembly projects |
| `manasik:booking_products` | `BookingProduct[]` | Product definitions |
| `manasik:recent_colors` | `string[]` | Last 12 used colors |

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

### Phase 6: Polish & Optimization (Week 11-12)
- [ ] Performance optimization
- [ ] PWA configuration
- [ ] Offline support
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
  "zustand": "^4.4.0"
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
- Environment variables (if needed)
- Automatic deployments on push

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
- Rate limiting for API routes (if added)
- No sensitive data in localStorage

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
- Project save: < 500ms
- Image export: < 2s (typical design)

---

## Future Enhancements

### Phase 2+ Features
- [ ] Cloud sync (Cloudflare R2 or similar)
- [ ] Real-time collaboration
- [ ] Advanced AI tools
- [ ] Custom font upload
- [ ] Template marketplace
- [ ] Advanced export options
- [ ] Video export support
- [ ] Animation timeline

### Technical Debt
- [ ] Split monolithic editor into smaller components
- [ ] Add comprehensive test coverage
- [ ] Implement error boundary system
- [ ] Add analytics (privacy-focused)
- [ ] Optimize bundle size

---

## Success Criteria

1. **Functional Parity**: All features from React Native version work in web
2. **Performance**: Smooth 60fps canvas interactions
3. **Offline Support**: Full functionality without internet
4. **RTL Support**: Proper Arabic text rendering and layout
5. **Cross-Browser**: Works on all major browsers
6. **Mobile Friendly**: Responsive design works on mobile devices
7. **Export Quality**: PNG/PDF exports match original design
8. **Data Persistence**: Reliable IndexedDB storage

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