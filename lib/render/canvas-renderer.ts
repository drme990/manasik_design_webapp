import { createCanvas, GlobalFonts, loadImage, type SKRSContext2D } from '@napi-rs/canvas';
import { readFile } from 'fs/promises';
import { join } from 'path';
import type {
  Project,
  AnyLayer,
  TextLayer,
  ImageLayer,
  ShapeLayer,
  DynamicFieldLayer,
} from '@/types';

// ─── Types ────────────────────────────────────────────────────────────────

interface OrderDataPayload {
  orderNumber?: string;
  totalAmount?: number;
  paidAmount?: number;
  remainingAmount?: number;
  currency?: string;
  status?: string;
  billingData?: {
    fullName?: string;
    email?: string;
    phone?: string;
    country?: string;
  };
  billing?: {
    fullName?: string;
    email?: string;
    phone?: string;
    country?: string;
  };
  items?: Array<{
    productId?: string;
    productName?: { ar?: string; en?: string };
    quantity?: number;
  }>;
  item?: {
    productId?: string;
    productName?: { ar?: string; en?: string };
    quantity?: number;
  };
  reservationData?: Array<{ key: string; value: string }>;
  reservation?: Record<string, string>;
  source?: string;
  locale?: string;
}

// ─── Font registration ────────────────────────────────────────────────────

let fontsRegistered = false;

/**
 * Register Expo Arabic fonts from the public directory with the canvas
 * engine. Called once per process — fonts don't change at runtime.
 *
 * Tajawal and IBM Plex Sans Arabic (Google Fonts) are also registered
 * if their .ttf files are present in public/fonts/. If not, text using
 * those families falls back to the system default.
 */
async function ensureFontsRegistered(): Promise<void> {
  if (fontsRegistered) return;

  const fontDir = join(process.cwd(), 'public', 'fonts', 'ExpoArabic');
  const expoFonts: Array<{ path: string; family: string }> = [
    { path: 'ExpoArabic-Light.ttf', family: 'Expo Arabic' },
    { path: 'ExpoArabic-Book.ttf', family: 'Expo Arabic' },
    { path: 'ExpoArabic-Medium.ttf', family: 'Expo Arabic' },
    { path: 'ExpoArabic-SemiBold.ttf', family: 'Expo Arabic' },
    { path: 'ExpoArabic-Bold.otf', family: 'Expo Arabic' },
  ];

  for (const font of expoFonts) {
    try {
      const buffer = await readFile(join(fontDir, font.path));
      GlobalFonts.register(buffer, font.family);
    } catch {
      // Font file missing — skip
    }
  }

  // Try to register Tajawal + IBM Plex Sans Arabic if available locally
  // (downloaded from Google Fonts). If not present, text using these
  // families will fall back to the default font.
  const googleFontDir = join(process.cwd(), 'public', 'fonts', 'google');
  const googleFonts: Array<{ path: string; family: string }> = [
    { path: 'Tajawal-Regular.ttf', family: 'Tajawal' },
    { path: 'Tajawal-Bold.ttf', family: 'Tajawal' },
    { path: 'IBMPlexSansArabic-Regular.ttf', family: 'IBM Plex Sans Arabic' },
    { path: 'IBMPlexSansArabic-Bold.ttf', family: 'IBM Plex Sans Arabic' },
  ];
  for (const font of googleFonts) {
    try {
      const buffer = await readFile(join(googleFontDir, font.path));
      GlobalFonts.register(buffer, font.family);
    } catch {
      // Font file missing — skip
    }
  }

  fontsRegistered = true;
}

// ─── Dynamic field resolution ─────────────────────────────────────────────

/**
 * Resolve a dynamic field's variableId against the order data payload.
 * Same logic as the client-side renderer + the old Puppeteer renderer.
 */
function resolveFieldValue(
  variableId: string,
  orderData: OrderDataPayload,
): string | undefined {
  if (variableId.startsWith('billing.')) {
    const key = variableId.slice('billing.'.length);
    const source = orderData.billingData || orderData.billing || {};
    return (source as Record<string, string | undefined>)[key];
  }
  if (variableId.startsWith('order.')) {
    const key = variableId.slice('order.'.length);
    return (orderData as Record<string, unknown>)[key]?.toString();
  }
  if (variableId.startsWith('item.')) {
    const key = variableId.slice('item.'.length);
    const item = orderData.item || orderData.items?.[0];
    if (!item) return undefined;
    if (key === 'productName') {
      const name = item.productName;
      if (!name) return undefined;
      return orderData.locale === 'en' ? name.en : name.ar || name.en;
    }
    return (item as Record<string, unknown>)[key]?.toString();
  }
  if (variableId.startsWith('reservation.')) {
    const key = variableId.slice('reservation.'.length);
    if (orderData.reservation && orderData.reservation[key]) {
      return orderData.reservation[key];
    }
    if (orderData.reservationData) {
      const entry = orderData.reservationData.find((r) => r.key === key);
      return entry?.value;
    }
    return undefined;
  }
  return undefined;
}

// ─── Image loading ────────────────────────────────────────────────────────

/**
 * Cache loaded images by URL within a single render pass to avoid
 * re-fetching the same image (e.g. background used on multiple layers).
 */
const imageCache = new Map<string, Awaited<ReturnType<typeof loadImage>>>();

async function loadImageFromUrl(url: string): Promise<Awaited<ReturnType<typeof loadImage>>> {
  const cached = imageCache.get(url);
  if (cached) return cached;

  // Fetch the image buffer, then load it into the canvas Image
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${url} (${response.status})`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  const image = await loadImage(buffer);
  imageCache.set(url, image);
  return image;
}

// ─── Transform helpers ────────────────────────────────────────────────────

/**
 * Apply a layer's transform (position + rotation) to the canvas context.
 * After calling this, drawing at (0, 0) renders at the layer's position
 * with the layer's rotation applied.
 *
 * The rotation pivot is the center of the layer (matching the editor).
 */
function applyLayerTransform(ctx: SKRSContext2D, layer: AnyLayer): void {
  const cx = layer.x + layer.width / 2;
  const cy = layer.y + layer.height / 2;
  ctx.translate(cx, cy);
  if (layer.rotation) {
    ctx.rotate((layer.rotation * Math.PI) / 180);
  }
  ctx.translate(-layer.width / 2, -layer.height / 2);
}

// ─── Text rendering ───────────────────────────────────────────────────────

/**
 * Build the CSS font string for a text layer.
 * e.g. "italic 700 24px 'Expo Arabic'"
 */
function buildFontString(layer: TextLayer): string {
  const style = layer.italic ? 'italic ' : '';
  const weight = layer.bold ? 700 : layer.fontWeight || 400;
  return `${style}${weight} ${layer.fontSize}px '${layer.fontFamily}'`;
}

/**
 * Wrap text into lines that fit within `maxWidth`.
 * Uses ctx.measureText() to check line widths.
 */
function wrapText(
  ctx: SKRSContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const lines: string[] = [];
  const paragraphs = text.split('\n');

  for (const paragraph of paragraphs) {
    if (paragraph === '') {
      lines.push('');
      continue;
    }

    // If no wrapping needed (no maxWidth or text fits), push as-is
    if (!maxWidth || ctx.measureText(paragraph).width <= maxWidth) {
      lines.push(paragraph);
      continue;
    }

    // Word-wrap
    const words = paragraph.split(' ');
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      if (ctx.measureText(testLine).width <= maxWidth) {
        currentLine = testLine;
      } else {
        if (currentLine) lines.push(currentLine);
        currentLine = word;
      }
    }
    if (currentLine) lines.push(currentLine);
  }

  return lines;
}

function renderTextLayer(ctx: SKRSContext2D, layer: TextLayer): void {
  if (!layer.text) return;

  ctx.font = buildFontString(layer);
  ctx.fillStyle = layer.color;
  ctx.textBaseline = 'top';

  // Determine wrapping width
  const wrapWidth = layer.boxWidth && layer.boxWidth > 0 ? layer.boxWidth : 0;

  // Set textAlign — note: canvas textAlign is relative to the x position
  // of the fillText call, not the bounding box. We handle alignment by
  // calculating the x offset ourselves.
  const lines = wrapText(ctx, layer.text, wrapWidth);
  const lineHeight = layer.fontSize * layer.lineHeight;
  const totalHeight = lines.length * lineHeight;

  // Vertical alignment within the layer box
  let startY = 0;
  if (layer.verticalAlign === 'middle') {
    startY = (layer.height - totalHeight) / 2;
  } else if (layer.verticalAlign === 'bottom') {
    startY = layer.height - totalHeight;
  }

  // Clip to the layer box (so overflow is hidden, matching the editor)
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, layer.width, layer.height);
  ctx.clip();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const y = startY + i * lineHeight;
    const lineWidth = ctx.measureText(line).width;

    let x = 0;
    if (layer.align === 'center') {
      x = (layer.width - lineWidth) / 2;
    } else if (layer.align === 'right') {
      x = layer.width - lineWidth;
    }

    // Handle RTL direction — for Arabic text, the canvas still draws
    // LTR by default. The font itself handles RTL shaping, but we need
    // to flip the x position for right-aligned text in RTL mode.
    if (layer.direction === 'rtl' && layer.align === 'left') {
      // In RTL with "left" align, text should start from the right
      x = layer.width - lineWidth;
    }

    ctx.fillText(line, x, y);
  }

  ctx.restore();
}

// ─── Image rendering ──────────────────────────────────────────────────────

async function renderImageLayer(ctx: SKRSContext2D, layer: ImageLayer): Promise<void> {
  if (!layer.uri || layer.uri.startsWith('blob:')) return;

  // Collage layers — render each cell
  if (layer.collage) {
    renderCollageLayer(ctx, layer);
    return;
  }

  let image: Awaited<ReturnType<typeof loadImage>>;
  try {
    image = await loadImageFromUrl(layer.uri);
  } catch {
    return; // Image failed to load — skip
  }

  ctx.save();

  // Clip to the layer box (with border radius)
  if (layer.borderRadius > 0) {
    roundedRectPath(ctx, 0, 0, layer.width, layer.height, layer.borderRadius);
    ctx.clip();
  }

  // Apply flip
  if (layer.flipX || layer.flipY) {
    ctx.translate(layer.flipX ? layer.width : 0, layer.flipY ? layer.height : 0);
    ctx.scale(layer.flipX ? -1 : 1, layer.flipY ? -1 : 1);
  }

  // Non-destructive crop: only show the cropRect region of the original image
  if (layer.cropRect) {
    const crop = layer.cropRect;
    // Draw only the cropped portion, scaled to fill the layer box
    ctx.drawImage(
      image,
      crop.x, crop.y, crop.width, crop.height, // source
      0, 0, layer.width, layer.height, // destination
    );
  } else {
    // Standard image: draw with scale + offset (pan/zoom within frame)
    const drawW = layer.naturalWidth * layer.imageScale;
    const drawH = layer.naturalHeight * layer.imageScale;
    ctx.drawImage(image, layer.offsetX, layer.offsetY, drawW, drawH);
  }

  ctx.restore();

  // Border (drawn after the image, on top)
  if (layer.borderWidth > 0) {
    ctx.strokeStyle = layer.borderColor;
    ctx.lineWidth = layer.borderWidth;
    if (layer.borderRadius > 0) {
      roundedRectPath(ctx, 0, 0, layer.width, layer.height, layer.borderRadius);
      ctx.stroke();
    } else {
      ctx.strokeRect(0, 0, layer.width, layer.height);
    }
  }
}

/**
 * Render a collage layer — multiple image cells in a grid layout.
 * Each cell shows its own image, positioned according to the layout.
 */
async function renderCollageLayer(ctx: SKRSContext2D, layer: ImageLayer): Promise<void> {
  if (!layer.collage) return;

  const { cells, gap, bgColor, containerRadius } = layer.collage;

  // Fill background
  ctx.fillStyle = bgColor;
  if (containerRadius > 0) {
    roundedRectPath(ctx, 0, 0, layer.width, layer.height, containerRadius);
    ctx.fill();
  } else {
    ctx.fillRect(0, 0, layer.width, layer.height);
  }

  // We need the layout cell definitions to know positions.
  // Since we can't import the COLLAGE_LAYOUTS constant (it's in a
  // client-side constants file), we'll use a simple proportional
  // layout based on the number of cells.
  // For now, render cells in a simple grid. The exact layout matching
  // is a known limitation — the server-side renderer uses a basic grid.
  const cellCount = cells.length;
  if (cellCount === 0) return;

  // Simple grid: 1 col for 1-2 cells, 2 cols for 3-4, etc.
  const cols = cellCount <= 2 ? 1 : 2;
  const rows = Math.ceil(cellCount / cols);
  const cellW = (layer.width - gap * (cols + 1)) / cols;
  const cellH = (layer.height - gap * (rows + 1)) / rows;

  for (let i = 0; i < cellCount && i < cells.length; i++) {
    const cell = cells[i];
    if (!cell?.uri) continue;

    const col = i % cols;
    const row = Math.floor(i / cols);
    const cellX = gap + col * (cellW + gap);
    const cellY = gap + row * (cellH + gap);

    try {
      const img = await loadImageFromUrl(cell.uri);
      ctx.save();
      // Clip to cell bounds (with border radius)
      if (layer.borderRadius > 0) {
        roundedRectPath(ctx, cellX, cellY, cellW, cellH, layer.borderRadius);
        ctx.clip();
      } else {
        ctx.beginPath();
        ctx.rect(cellX, cellY, cellW, cellH);
        ctx.clip();
      }
      // Draw image to fill the cell (cover fit)
      drawImageCover(ctx, img, cellX, cellY, cellW, cellH, cell.scale, cell.offsetX, cell.offsetY);
      ctx.restore();
    } catch {
      // Cell image failed — skip
    }
  }
}

/**
 * Draw an image to fill a rectangle using "cover" fit, with optional
 * scale and offset (for pan/zoom within the cell).
 */
function drawImageCover(
  ctx: SKRSContext2D,
  image: Awaited<ReturnType<typeof loadImage>>,
  x: number, y: number, w: number, h: number,
  scale = 1, offsetX = 0, offsetY = 0,
): void {
  const imgW = image.width;
  const imgH = image.height;
  const containerRatio = w / h;
  const imgRatio = imgW / imgH;

  let drawW: number, drawH: number;
  if (imgRatio > containerRatio) {
    drawH = h * scale;
    drawW = drawH * imgRatio;
  } else {
    drawW = w * scale;
    drawH = drawW / imgRatio;
  }

  const dx = x + (w - drawW) / 2 + offsetX;
  const dy = y + (h - drawH) / 2 + offsetY;
  ctx.drawImage(image, dx, dy, drawW, drawH);
}

// ─── Shape rendering ──────────────────────────────────────────────────────

/**
 * Build a star polygon path on the canvas context.
 */
function starPath(
  ctx: SKRSContext2D,
  cx: number, cy: number,
  outerR: number, innerR: number,
  points: number,
): void {
  const step = Math.PI / points;
  ctx.beginPath();
  for (let i = 0; i < 2 * points; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const angle = i * step - Math.PI / 2;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

/**
 * Build a rounded rectangle path on the canvas context.
 */
function roundedRectPath(
  ctx: SKRSContext2D,
  x: number, y: number, w: number, h: number, r: number,
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.arcTo(x + w, y, x + w, y + radius, radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.arcTo(x + w, y + h, x + w - radius, y + h, radius);
  ctx.lineTo(x + radius, y + h);
  ctx.arcTo(x, y + h, x, y + h - radius, radius);
  ctx.lineTo(x, y + radius);
  ctx.arcTo(x, y, x + radius, y, radius);
  ctx.closePath();
}

async function renderShapeLayer(ctx: SKRSContext2D, layer: ShapeLayer): Promise<void> {
  const padding = layer.strokeWidth / 2;
  const innerW = Math.max(0, layer.width - layer.strokeWidth);
  const innerH = Math.max(0, layer.height - layer.strokeWidth);

  // PNG shape — draw the uploaded PNG image
  if (layer.shape === 'png' && layer.uri) {
    try {
      const img = await loadImageFromUrl(layer.uri);
      ctx.drawImage(img, 0, 0, layer.width, layer.height);
    } catch {
      // Image failed — skip
    }
    return;
  }

  // Line shape
  if (layer.shape === 'line') {
    ctx.strokeStyle = layer.strokeColor;
    ctx.lineWidth = layer.strokeWidth;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(padding, layer.height / 2);
    ctx.lineTo(layer.width - padding, layer.height / 2);
    ctx.stroke();
    return;
  }

  // Circle / ellipse
  if (layer.shape === 'circle') {
    ctx.beginPath();
    ctx.ellipse(
      layer.width / 2, layer.height / 2,
      innerW / 2, innerH / 2,
      0, 0, Math.PI * 2,
    );
    if (layer.filled) {
      ctx.fillStyle = layer.fillColor;
      ctx.fill();
    }
    if (layer.strokeWidth > 0) {
      ctx.strokeStyle = layer.strokeColor;
      ctx.lineWidth = layer.strokeWidth;
      ctx.stroke();
    }
    return;
  }

  // Triangle
  if (layer.shape === 'triangle') {
    ctx.beginPath();
    ctx.moveTo(layer.width / 2, padding);
    ctx.lineTo(padding, layer.height - padding);
    ctx.lineTo(layer.width - padding, layer.height - padding);
    ctx.closePath();
    if (layer.filled) {
      ctx.fillStyle = layer.fillColor;
      ctx.fill();
    }
    if (layer.strokeWidth > 0) {
      ctx.strokeStyle = layer.strokeColor;
      ctx.lineWidth = layer.strokeWidth;
      ctx.lineJoin = 'round';
      ctx.stroke();
    }
    return;
  }

  // Stars
  if (layer.shape.startsWith('star_')) {
    const pointsCount = parseInt(layer.shape.split('_')[1], 10) || 5;
    const outerR = Math.min(innerW, innerH) / 2;
    const innerR = outerR * 0.4;
    starPath(ctx, layer.width / 2, layer.height / 2, outerR, innerR, pointsCount);
    if (layer.filled) {
      ctx.fillStyle = layer.fillColor;
      ctx.fill();
    }
    if (layer.strokeWidth > 0) {
      ctx.strokeStyle = layer.strokeColor;
      ctx.lineWidth = layer.strokeWidth;
      ctx.lineJoin = 'round';
      ctx.stroke();
    }
    return;
  }

  // Rectangle (with optional corner radius)
  if (layer.cornerRadius && layer.cornerRadius > 0) {
    roundedRectPath(ctx, padding, padding, innerW, innerH, layer.cornerRadius);
  } else {
    ctx.beginPath();
    ctx.rect(padding, padding, innerW, innerH);
  }
  if (layer.filled) {
    ctx.fillStyle = layer.fillColor;
    ctx.fill();
  }
  if (layer.strokeWidth > 0) {
    ctx.strokeStyle = layer.strokeColor;
    ctx.lineWidth = layer.strokeWidth;
    ctx.stroke();
  }
}

// ─── Dynamic field rendering ──────────────────────────────────────────────

async function renderDynamicFieldLayer(
  ctx: SKRSContext2D,
  layer: DynamicFieldLayer,
  orderData: OrderDataPayload,
): Promise<void> {
  const value = resolveFieldValue(layer.variableId, orderData);
  if (!value) return; // Field not resolved — skip

  // Background color
  if (layer.backgroundColor) {
    ctx.fillStyle = layer.backgroundColor;
    if (layer.borderRadius && layer.borderRadius > 0) {
      roundedRectPath(ctx, 0, 0, layer.width, layer.height, layer.borderRadius);
      ctx.fill();
    } else {
      ctx.fillRect(0, 0, layer.width, layer.height);
    }
  }

  if (layer.fieldType === 'image') {
    // Image dynamic field — draw the resolved image URL
    try {
      const img = await loadImageFromUrl(value);
      ctx.save();
      if (layer.borderRadius && layer.borderRadius > 0) {
        roundedRectPath(ctx, 0, 0, layer.width, layer.height, layer.borderRadius);
        ctx.clip();
      }
      drawImageCover(ctx, img, 0, 0, layer.width, layer.height);
      ctx.restore();
    } catch {
      // Image failed — skip
    }
  } else {
    // Text dynamic field — draw the resolved text, auto-shrunk to fit
    // Binary search for the largest font size that fits (matching the
    // client-side DynamicFieldText component behavior)
    // DynamicFieldLayer doesn't have a fontFamily field — use Expo Arabic
    // (the app's primary Arabic font) as the default.
    const fieldFontFamily = 'Expo Arabic';
    let lo = 4;
    let hi = layer.fontSize;
    let bestSize = lo;

    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2);
      ctx.font = `${mid}px '${fieldFontFamily}'`;
      const metrics = ctx.measureText(value);
      const padding = 8; // 4px padding each side (matching client)
      const fits =
        metrics.width <= layer.width - padding &&
        mid <= layer.height - padding;
      if (fits) {
        bestSize = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }

    ctx.font = `${bestSize}px '${fieldFontFamily}'`;
    ctx.fillStyle = layer.color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(value, layer.width / 2, layer.height / 2);
  }

  // Border
  if (layer.borderWidth && layer.borderWidth > 0 && layer.borderColor) {
    ctx.strokeStyle = layer.borderColor;
    ctx.lineWidth = layer.borderWidth;
    if (layer.borderRadius && layer.borderRadius > 0) {
      roundedRectPath(ctx, 0, 0, layer.width, layer.height, layer.borderRadius);
      ctx.stroke();
    } else {
      ctx.strokeRect(0, 0, layer.width, layer.height);
    }
  }
}

// ─── Main render function ─────────────────────────────────────────────────

/**
 * Render a project (template or design instance) to a JPG buffer using
 * @napi-rs/canvas — a native Rust-based canvas engine that runs in
 * Node.js without a browser. Works on Vercel serverless functions.
 *
 * This replaces the old Puppeteer-based renderer which required Chrome
 * (not available on Vercel serverless).
 *
 * Supports: text, image, shape, and dynamic field layers. Collage
 * layers use a simplified grid layout (not the exact editor layout).
 */
export async function renderTemplateToJpg(
  template: Project,
  orderData: Record<string, unknown>,
): Promise<Buffer> {
  await ensureFontsRegistered();

  // Clear the image cache for this render pass
  imageCache.clear();

  // Render at 2x resolution for sharper output (like a retina display).
  // The canvas is created at 2x dimensions, and we scale the context so
  // all drawing code can use the original (logical) coordinates. The
  // resulting JPEG has 4x the pixels = much sharper when displayed.
  const RENDER_SCALE = 2;
  const canvas = createCanvas(
    template.canvasWidth * RENDER_SCALE,
    template.canvasHeight * RENDER_SCALE,
  );
  const ctx = canvas.getContext('2d');
  ctx.scale(RENDER_SCALE, RENDER_SCALE);

  // Smooth image scaling for high-quality output
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // ── Background ───────────────────────────────────────────────────
  if (template.backgroundUri && !template.backgroundUri.startsWith('blob:')) {
    try {
      const bgImage = await loadImageFromUrl(template.backgroundUri);
      ctx.drawImage(bgImage, 0, 0, template.canvasWidth, template.canvasHeight);
    } catch {
      // Background image failed — fill with background color
      ctx.fillStyle = template.backgroundColor || '#ffffff';
      ctx.fillRect(0, 0, template.canvasWidth, template.canvasHeight);
    }
  } else {
    ctx.fillStyle = template.backgroundColor || '#ffffff';
    ctx.fillRect(0, 0, template.canvasWidth, template.canvasHeight);
  }

  // ── Layers (sorted by zIndex) ────────────────────────────────────
  const sortedLayers = [...template.layers]
    .filter((l) => l.visible)
    .sort((a, b) => a.zIndex - b.zIndex);

  for (const layer of sortedLayers) {
    ctx.save();
    ctx.globalAlpha = layer.opacity;
    applyLayerTransform(ctx, layer);

    switch (layer.type) {
      case 'text':
        renderTextLayer(ctx, layer);
        break;
      case 'image':
        await renderImageLayer(ctx, layer);
        break;
      case 'shape':
        await renderShapeLayer(ctx, layer);
        break;
      case 'dynamic_field':
        await renderDynamicFieldLayer(ctx, layer, orderData as OrderDataPayload);
        break;
    }

    ctx.restore();
  }

  // ── Export as JPEG ───────────────────────────────────────────────
  // @napi-rs/canvas toBuffer signature: (mime, quality?) where quality
  // is a number 0-1. Max quality (1) + 2x render scale = sharp output.
  return canvas.toBuffer('image/jpeg', 1);
}
