import { readFile } from 'fs/promises';
import { join } from 'path';
import type {
  Project,
  TextLayer,
  ImageLayer,
  ShapeLayer,
  DynamicFieldLayer,
  AnyLayer,
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

// ─── Font loading ─────────────────────────────────────────────────────────

let cachedFonts: string | null = null;

/**
 * Load the Expo Arabic font files from the public directory and convert
 * them to base64 data URIs for embedding in the puppeteer HTML.
 *
 * Tajawal and IBM Plex Sans Arabic are loaded from Google Fonts CDN
 * directly in the HTML (see buildHtmlHead).
 *
 * The result is cached for the lifetime of the process — font files
 * don't change at runtime.
 */
async function getExpoArabicFontFaces(): Promise<string> {
  if (cachedFonts !== null) return cachedFonts;

  const fontDir = join(process.cwd(), 'public', 'fonts', 'ExpoArabic');
  const fontFiles: Array<{ path: string; weight: number }> = [
    { path: 'ExpoArabic-Light.ttf', weight: 300 },
    { path: 'ExpoArabic-Book.ttf', weight: 400 },
    { path: 'ExpoArabic-Medium.ttf', weight: 500 },
    { path: 'ExpoArabic-SemiBold.ttf', weight: 600 },
    { path: 'ExpoArabic-Bold.otf', weight: 700 },
  ];

  const faceDeclarations: string[] = [];

  for (const font of fontFiles) {
    try {
      const buffer = await readFile(join(fontDir, font.path));
      const base64 = buffer.toString('base64');
      const mimeType = font.path.endsWith('.otf') ? 'font/opentype' : 'font/ttf';
      faceDeclarations.push(
        `@font-face {
  font-family: 'Expo Arabic';
  src: url(data:${mimeType};charset=utf-8;base64,${base64}) format('${font.path.endsWith('.otf') ? 'opentype' : 'truetype'}');
  font-weight: ${font.weight};
  font-style: normal;
  font-display: block;
}`,
      );
    } catch {
      // Font file missing — skip, text will fall back to system fonts
    }
  }

  cachedFonts = faceDeclarations.join('\n');
  return cachedFonts;
}

// ─── Dynamic field resolution ─────────────────────────────────────────────

/**
 * Resolve a dynamic field's variableId against the order data payload.
 *
 * Variable IDs match the backend data paths:
 *   - billing.*   → billingData.{fullName|email|phone|country}
 *   - order.*     → {orderNumber|totalAmount|...}
 *   - item.*      → currentItem.{productName|quantity}
 *   - reservation.* → reservation[key]
 *
 * Returns the raw value (string for text fields, URL string for image
 * fields). Returns undefined if the field can't be resolved.
 */
function resolveFieldValue(
  variableId: string,
  orderData: OrderDataPayload,
): string | undefined {
  // billing.* — check both billingData and billing (convenience alias)
  if (variableId.startsWith('billing.')) {
    const key = variableId.slice('billing.'.length);
    const source = orderData.billingData || orderData.billing || {};
    return (source as Record<string, string | undefined>)[key];
  }

  // order.* — top-level order fields
  if (variableId.startsWith('order.')) {
    const key = variableId.slice('order.'.length);
    return (orderData as Record<string, unknown>)[key]?.toString();
  }

  // item.* — current item fields
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

  // reservation.* — flattened reservation data
  if (variableId.startsWith('reservation.')) {
    const key = variableId.slice('reservation.'.length);
    // Prefer the flattened `reservation` object; fall back to searching
    // the `reservationData` array.
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

// ─── HTML escaping ────────────────────────────────────────────────────────

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeCssString(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

// ─── Layer → HTML conversion ──────────────────────────────────────────────

/**
 * Convert a pixel value to a CSS px string.
 * Handles undefined/null by returning '0px'.
 */
function px(value: number | undefined | null): string {
  return `${value ?? 0}px`;
}

/**
 * Build the common inline style for a layer's container div.
 * This mirrors the `commonProps.style` in LayerRenderer.tsx.
 */
function buildBaseLayerStyle(layer: AnyLayer): string {
  const parts: string[] = [
    `position:absolute`,
    `left:${px(layer.x)}`,
    `top:${px(layer.y)}`,
    `width:${px(layer.width)}`,
    `height:${px(layer.height)}`,
    `transform:rotate(${layer.rotation}deg)`,
    `opacity:${layer.opacity}`,
    `z-index:${layer.zIndex}`,
    `display:${layer.visible ? 'block' : 'none'}`,
  ];
  return parts.join(';');
}

/**
 * Resolve the CSS font-family for a layer's fontFamily field.
 * Maps named fonts to their CSS family declarations.
 */
function resolveCssFontFamily(fontFamily: string): string {
  const map: Record<string, string> = {
    'Expo Arabic': "'Expo Arabic', sans-serif",
    'Tajawal': "'Tajawal', sans-serif",
    'IBM Plex Sans Arabic': "'IBM Plex Sans Arabic', sans-serif",
  };
  return map[fontFamily] || `'${fontFamily}', sans-serif`;
}

/**
 * Convert a text layer to HTML.
 * Mirrors TextLayerComponent in LayerRenderer.tsx.
 */
function textLayerToHtml(layer: TextLayer): string {
  const fontWeight = layer.bold ? 700 : layer.fontWeight || 400;
  const fontStyle = layer.italic ? 'italic' : 'normal';
  const alignItems =
    layer.verticalAlign === 'top'
      ? 'flex-start'
      : layer.verticalAlign === 'bottom'
        ? 'flex-end'
        : 'center';

  const hasBoxWidth = layer.boxWidth !== undefined && layer.boxWidth > 0;
  const whiteSpace = hasBoxWidth ? 'pre-wrap' : 'pre';
  const wordBreak = hasBoxWidth ? 'break-word' : 'normal';
  const overflowWrap = hasBoxWidth ? 'anywhere' : 'normal';
  const widthStyle = hasBoxWidth ? `width:${px(layer.boxWidth)}` : '';

  const textContent = escapeHtml(layer.text || ' ');

  return `<div style="${buildBaseLayerStyle(layer)};color:${layer.color};font-family:${resolveCssFontFamily(layer.fontFamily)};font-size:${layer.fontSize}px;font-weight:${fontWeight};font-style:${fontStyle};text-align:${layer.align};line-height:${layer.lineHeight};direction:${layer.direction};display:flex;align-items:${alignItems};justify-content:${layer.align};white-space:${whiteSpace};word-break:${wordBreak};overflow-wrap:${overflowWrap};overflow:visible;${widthStyle}">${textContent}</div>`;
}

/**
 * Convert an image layer to HTML.
 * Mirrors ImageLayerComponent in LayerRenderer.tsx (single image, no collage).
 *
 * Handles:
 *   - Non-destructive crop via background-image positioning
 *   - Standard (no crop) via <img> with object-fit: cover
 *   - Border, border-radius, flip
 */
function imageLayerToHtml(layer: ImageLayer): string {
  const baseTransform = `rotate(${layer.rotation}deg) scaleX(${layer.flipX ? -1 : 1}) scaleY(${layer.flipY ? -1 : 1})`;
  const borderStyle = layer.borderWidth > 0
    ? `border:${layer.borderWidth}px solid ${layer.borderColor}`
    : '';

  // Collage — render the first cell's image as a fallback.
  // Full collage grid rendering is not yet supported in the server-side
  // renderer; the editor's CollageCellImage component uses interactive
  // positioning that can't be reproduced statically. We render the first
  // image to avoid a blank box.
  if (layer.collage && layer.collage.cells.length > 0) {
    const firstCell = layer.collage.cells[0];
    if (firstCell?.uri) {
      const containerStyle = `${buildBaseLayerStyle(layer)};border-radius:${layer.collage.containerRadius || 0}px;overflow:hidden;transform:${baseTransform};background-color:${layer.collage.bgColor || '#000'}`;
      return `<div style="${containerStyle}"><img src="${escapeHtml(firstCell.uri)}" style="width:100%;height:100%;object-fit:cover;pointer-events:none" /></div>`;
    }
  }

  const hasCrop = !!layer.cropRect;
  const displayUri = layer.uri;

  if (hasCrop) {
    const crop = layer.cropRect!;
    const origW = layer.originalNaturalWidth || layer.naturalWidth;
    const origH = layer.originalNaturalHeight || layer.naturalHeight;
    const scaledW = origW * layer.imageScale;
    const scaledH = origH * layer.imageScale;
    const bgX = -(crop.x * layer.imageScale) + layer.offsetX;
    const bgY = -(crop.y * layer.imageScale) + layer.offsetY;

    return `<div style="${buildBaseLayerStyle(layer)};border-radius:${layer.borderRadius}px;${borderStyle};overflow:hidden;transform:${baseTransform}"><div style="width:100%;height:100%;background-image:url("${escapeCssString(displayUri)}");background-size:${scaledW}px ${scaledH}px;background-position:${bgX}px ${bgY}px;background-repeat:no-repeat"></div></div>`;
  }

  // No crop — standard image rendering
  const imgW = layer.naturalWidth * layer.imageScale;
  const imgH = layer.naturalHeight * layer.imageScale;

  return `<div style="${buildBaseLayerStyle(layer)};border-radius:${layer.borderRadius}px;${borderStyle};overflow:hidden;transform:${baseTransform}"><img src="${escapeHtml(displayUri)}" style="width:${imgW}px;height:${imgH}px;object-fit:cover;transform:translate(${layer.offsetX}px,${layer.offsetY}px);pointer-events:none;user-select:none" /></div>`;
}

/**
 * Convert a shape layer to HTML.
 * Mirrors ShapeRenderer.tsx — produces inline SVG for each shape type.
 */
function shapeLayerToHtml(layer: ShapeLayer): string {
  const { width, height } = layer;
  const padding = layer.strokeWidth / 2;
  const innerWidth = Math.max(0, width - layer.strokeWidth);
  const innerHeight = Math.max(0, height - layer.strokeWidth);
  const fill = layer.filled ? layer.fillColor : 'transparent';

  // PNG shape — render as <img>
  if (layer.shape === 'png' && layer.uri) {
    return `<div style="${buildBaseLayerStyle(layer)}"><img src="${escapeHtml(layer.uri)}" style="width:${width}px;height:${height}px;object-fit:contain;pointer-events:none" /></div>`;
  }

  const svgAttrs = `width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"`;

  if (layer.shape === 'line') {
    return `<div style="${buildBaseLayerStyle(layer)}"><svg ${svgAttrs}><line x1="${padding}" y1="${height / 2}" x2="${width - padding}" y2="${height / 2}" stroke="${layer.strokeColor}" stroke-width="${layer.strokeWidth}" stroke-linecap="round" /></svg></div>`;
  }

  if (layer.shape === 'circle') {
    return `<div style="${buildBaseLayerStyle(layer)}"><svg ${svgAttrs}><ellipse cx="${width / 2}" cy="${height / 2}" rx="${innerWidth / 2}" ry="${innerHeight / 2}" fill="${fill}" stroke="${layer.strokeColor}" stroke-width="${layer.strokeWidth}" /></svg></div>`;
  }

  if (layer.shape === 'triangle') {
    const points = `${width / 2},${padding} ${padding},${height - padding} ${width - padding},${height - padding}`;
    return `<div style="${buildBaseLayerStyle(layer)}"><svg ${svgAttrs}><polygon points="${points}" fill="${fill}" stroke="${layer.strokeColor}" stroke-width="${layer.strokeWidth}" stroke-linejoin="round" /></svg></div>`;
  }

  if (layer.shape.startsWith('star_')) {
    const pointsCount = parseInt(layer.shape.split('_')[1], 10) || 5;
    const outerR = Math.min(innerWidth, innerHeight) / 2;
    const innerR = outerR * 0.4;
    const cx = width / 2;
    const cy = height / 2;
    const step = Math.PI / pointsCount;
    const coords: string[] = [];
    for (let i = 0; i < 2 * pointsCount; i++) {
      const r = i % 2 === 0 ? outerR : innerR;
      const angle = i * step - Math.PI / 2;
      coords.push(`${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`);
    }
    return `<div style="${buildBaseLayerStyle(layer)}"><svg ${svgAttrs}><polygon points="${coords.join(' ')}" fill="${fill}" stroke="${layer.strokeColor}" stroke-width="${layer.strokeWidth}" stroke-linejoin="round" /></svg></div>`;
  }

  // rectangle (with optional corner radius)
  const rx = layer.cornerRadius || 0;
  return `<div style="${buildBaseLayerStyle(layer)}"><svg ${svgAttrs}><rect x="${padding}" y="${padding}" width="${innerWidth}" height="${innerHeight}" rx="${rx}" fill="${fill}" stroke="${layer.strokeColor}" stroke-width="${layer.strokeWidth}" /></svg></div>`;
}

/**
 * Convert a dynamic field layer to HTML, inflating it with order data.
 *
 * For text fields: resolves the value and renders it as a text div.
 * For image fields: resolves the URL and renders it as an <img> with
 * object-fit: cover.
 *
 * If the value can't be resolved, falls back to the placeholder text
 * (for text fields) or renders nothing (for image fields).
 */
function dynamicFieldLayerToHtml(
  layer: DynamicFieldLayer,
  orderData: OrderDataPayload,
): string {
  const value = resolveFieldValue(layer.variableId, orderData);
  const borderStyle =
    layer.borderWidth && layer.borderWidth > 0
      ? `border:${layer.borderWidth}px solid ${layer.borderColor || 'transparent'}`
      : '';
  const bgStyle = layer.backgroundColor
    ? `background-color:${layer.backgroundColor}`
    : '';

  if (layer.fieldType === 'image') {
    if (!value) {
      // No image value — render empty box (transparent)
      return `<div style="${buildBaseLayerStyle(layer)};${borderStyle};border-radius:${layer.borderRadius || 0}px;overflow:hidden;${bgStyle}"></div>`;
    }
    // Render the image with object-fit: cover
    return `<div style="${buildBaseLayerStyle(layer)};${borderStyle};border-radius:${layer.borderRadius || 0}px;overflow:hidden;${bgStyle}"><img src="${escapeHtml(value)}" style="width:100%;height:100%;object-fit:${layer.imageFit || 'cover'};pointer-events:none" /></div>`;
  }

  // Text dynamic field
  const displayText = value || layer.placeholder;
  return `<div style="${buildBaseLayerStyle(layer)};${borderStyle};border-radius:${layer.borderRadius || 0}px;overflow:hidden;${bgStyle};display:flex;align-items:center;justify-content:center;color:${layer.color};font-size:${layer.fontSize}px;direction:rtl;text-align:center;word-break:break-word;padding:2px 4px"><div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;text-align:center;overflow:hidden">${escapeHtml(displayText)}</div></div>`;
}

/**
 * Convert any layer to HTML, dispatching by type.
 */
function layerToHtml(layer: AnyLayer, orderData: OrderDataPayload): string {
  switch (layer.type) {
    case 'text':
      return textLayerToHtml(layer);
    case 'image':
      return imageLayerToHtml(layer);
    case 'shape':
      return shapeLayerToHtml(layer);
    case 'dynamic_field':
      return dynamicFieldLayerToHtml(layer, orderData);
    default:
      return '';
  }
}

// ─── HTML document builder ────────────────────────────────────────────────

/**
 * Build the <head> for the puppeteer HTML document.
 *
 * Loads:
 *   - Expo Arabic font (base64-embedded from the public directory)
 *   - Tajawal + IBM Plex Sans Arabic (Google Fonts CDN)
 *   - A minimal CSS reset
 */
async function buildHtmlHead(): Promise<string> {
  const expoArabicFaces = await getExpoArabicFontFaces();

  return `<head>
<meta charset="utf-8" />
<style>
${expoArabicFaces}

/* Google Fonts — Tajawal + IBM Plex Sans Arabic */
@import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800&family=IBM+Plex+Sans+Arabic:wght@400;500;700&display=swap');

* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { width: 100%; height: 100%; overflow: hidden; background: transparent; }
img { -webkit-user-drag: none; user-select: none; }
</style>
</head>`;
}

/**
 * Build a complete, self-contained HTML document that reproduces the
 * template canvas with all layers, ready for puppeteer to screenshot.
 *
 * The document body contains a single div sized to the canvas dimensions,
 * with each layer as an absolutely-positioned child. Dynamic field layers
 * are inflated with the provided order data.
 */
async function buildTemplateHtml(
  template: Project,
  orderData: OrderDataPayload,
): Promise<string> {
  const head = await buildHtmlHead();

  // Sort layers by zIndex (matching the editor's render order)
  const sortedLayers = [...template.layers].sort((a, b) => a.zIndex - b.zIndex);

  // Build the canvas container
  const canvasBg = template.backgroundUri
    ? `background-image:url("${escapeCssString(template.backgroundUri)}");background-size:cover;background-position:center;background-repeat:no-repeat;`
    : template.backgroundColor
      ? `background-color:${template.backgroundColor};`
      : '';

  const layersHtml = sortedLayers
    .map((layer) => layerToHtml(layer, orderData))
    .join('\n');

  return `<!DOCTYPE html>
<html dir="rtl">
${head}
<body>
<div id="canvas" style="position:relative;width:${template.canvasWidth}px;height:${template.canvasHeight}px;overflow:hidden;${canvasBg}">
${layersHtml}
</div>
</body>
</html>`;
}

// ─── Puppeteer rendering ──────────────────────────────────────────────────

/**
 * Render a template project to a JPG buffer using puppeteer.
 *
 * 1. Build a self-contained HTML document from the template + order data.
 * 2. Launch a headless browser, set the viewport to the canvas dimensions.
 * 3. Set the HTML content and wait for all fonts + images to load.
 * 4. Screenshot the #canvas element as JPEG.
 * 5. Close the browser and return the buffer.
 *
 * The browser is launched with `--no-sandbox` for compatibility with
 * containerized environments. On Windows/macOS/Linux this is safe since
 * the browser is headless and only renders local HTML.
 */
export async function renderTemplateToJpg(
  template: Project,
  orderData: Record<string, unknown>,
): Promise<Buffer> {
  // Lazy import — puppeteer is a heavy dependency, only load it when
  // actually needed.
  const puppeteer = await import('puppeteer');

  const html = await buildTemplateHtml(template, orderData as OrderDataPayload);

  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage', // avoid /dev/shm issues in containers
      '--disable-gpu',
      '--font-render-hinting=none',
    ],
  });

  try {
    const page = await browser.newPage();

    // Set viewport to canvas dimensions + a small margin so the
    // screenshot captures the full canvas.
    await page.setViewport({
      width: template.canvasWidth,
      height: template.canvasHeight,
      deviceScaleFactor: 1,
    });

    // Set the HTML content
    await page.setContent(html, { waitUntil: 'domcontentloaded' });

    // Wait for all fonts to be ready (Expo Arabic base64 + Google Fonts)
    await page.evaluate(async () => {
      await (document as Document).fonts.ready;
    });

    // Wait for all images to load (R2 URLs, background images)
    await page.evaluate(async () => {
      const images = Array.from(document.querySelectorAll('img'));
      const loading = images
        .filter((img) => !img.complete)
        .map(
          (img) =>
            new Promise<void>((resolve) => {
              img.addEventListener('load', () => resolve());
              img.addEventListener('error', () => resolve());
            }),
        );
      await Promise.all(loading);
    });

    // Give Google Fonts a moment to finish loading (the @import is async)
    await page.waitForFunction(
      () => (document as Document).fonts.check("1em 'Tajawal'") && (document as Document).fonts.check("1em 'IBM Plex Sans Arabic'"),
      { timeout: 5000 },
    ).catch(() => {
      // Fonts might not load (offline / blocked) — continue with fallbacks
    });

    // Screenshot the #canvas element as JPEG
    // Note: omitBackground is a no-op for JPEG (JPEG has no alpha) — we
    // rely on the canvas div's background-color/background-image to fill
    // the canvas. If neither is set, the JPEG will have a white background
    // (the browser default).
    const canvasElement = await page.$('#canvas');
    if (!canvasElement) {
      throw new Error('Canvas element not found in rendered HTML');
    }

    const imageBuffer = await canvasElement.screenshot({
      type: 'jpeg',
      quality: 95,
    });

    return Buffer.from(imageBuffer);
  } finally {
    await browser.close();
  }
}
