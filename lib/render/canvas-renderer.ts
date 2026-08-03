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
import { COLLAGE_LAYOUTS } from '@/lib/constants/presets';

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
  /** The order's referral ID (e.g. "m1", "m2", "MNK-D", "GHD-D") */
  referralId?: string;
  /** All referrals from the DB — used by ref.phoneNumbers dynamic field */
  referrals?: Array<{
    referralId: string;
    phone: string;
    name: string;
  }>;
}

// ─── Render config ────────────────────────────────────────────────────────

/**
 * Render scale factor — the canvas is created at RENDER_SCALE times the
 * project's logical dimensions for sharper output (like a retina display).
 * The context is scaled by this factor, so all drawing code uses logical
 * coordinates. ctx.measureText() returns values in CSS pixels (logical,
 * NOT scaled by the transform), so width comparisons use logical widths
 * directly — no RENDER_SCALE multiplication needed.
 *
 * 1x gives good quality for Arabic text + diacritics while keeping the
 * output file size reasonable. 3x was too large for the order design
 * images.
 */
const RENDER_SCALE = 1;

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

  // ── Expo Arabic (primary Arabic design font) ──────────────────────
  // All weights registered under the same family name — the canvas
  // engine reads the weight from the font file's internal metadata
  // and matches it when ctx.font specifies a weight.
  const expoDir = join(process.cwd(), 'public', 'fonts', 'ExpoArabic');
  const expoFonts: Array<{ path: string; family: string }> = [
    { path: 'ExpoArabic-Light.ttf', family: 'Expo Arabic' },
    { path: 'ExpoArabic-Book.ttf', family: 'Expo Arabic' },
    { path: 'ExpoArabic-Medium.ttf', family: 'Expo Arabic' },
    { path: 'ExpoArabic-SemiBold.ttf', family: 'Expo Arabic' },
    { path: 'ExpoArabic-Bold.otf', family: 'Expo Arabic' },
  ];

  for (const font of expoFonts) {
    try {
      const buffer = await readFile(join(expoDir, font.path));
      GlobalFonts.register(buffer, font.family);
    } catch {
      // Font file missing — skip
    }
  }

  // ── Satoshi (Latin/UI font, may be used in designs) ───────────────
  const satoshiDir = join(process.cwd(), 'public', 'fonts', 'Satoshi');
  const satoshiFonts: Array<{ path: string; family: string }> = [
    { path: 'Satoshi-Light.otf', family: 'Satoshi' },
    { path: 'Satoshi-Regular.otf', family: 'Satoshi' },
    { path: 'Satoshi-Medium.otf', family: 'Satoshi' },
    { path: 'Satoshi-Bold.otf', family: 'Satoshi' },
    { path: 'Satoshi-Black.otf', family: 'Satoshi' },
    { path: 'Satoshi-Italic.otf', family: 'Satoshi' },
    { path: 'Satoshi-BoldItalic.otf', family: 'Satoshi' },
  ];

  for (const font of satoshiFonts) {
    try {
      const buffer = await readFile(join(satoshiDir, font.path));
      GlobalFonts.register(buffer, font.family);
    } catch {
      // Font file missing — skip
    }
  }

  // ── Tajawal + IBM Plex Sans Arabic (Google Fonts) ─────────────────
  // These are loaded via next/font/google in the editor, but the canvas
  // renderer needs the actual .ttf files. Download them from Google
  // Fonts and place in public/fonts/google/:
  //   https://fonts.google.com/specimen/Tajawal
  //   https://fonts.google.com/specimen/IBM+Plex+Sans+Arabic
  //
  // If not present, text using these families falls back to Expo Arabic.
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
 * Check if a resolved field value is "empty" / missing and should cause
 * the field to be hidden entirely (not rendered on the design).
 *
 * Treats the following as empty:
 *   - undefined / null
 *   - empty string or whitespace-only
 *   - the literal strings "none", "null", "undefined" (case-insensitive)
 */
function isEmptyValue(value: string | undefined): boolean {
  if (value === undefined || value === null) return true;
  const trimmed = value.trim();
  if (trimmed === '') return true;
  const lower = trimmed.toLowerCase();
  return lower === 'none' || lower === 'null' || lower === 'undefined';
}

/**
 * Format the `sacrificeFor` field (اسم الشخص المؤدى عنه) for display.
 *
 * The backend stores multiple names as a single newline-separated string
 * (e.g. "أحمد\nمحمد\nعلي"). For display on the design, each name goes on
 * its own line with "و" (Arabic "and") prepended to every name after the
 * first:
 *
 *   "أحمد\nمحمد\nعلي"  →  "أحمد\nو محمد\nو علي"
 *
 * A single name is returned as-is (no "و" prefix).
 */
function formatSacrificeForNames(raw: string): string {
  const names = raw
    .split('\n')
    .map((n) => n.trim())
    .filter(Boolean);
  if (names.length === 0) return raw.trim();
  if (names.length === 1) return names[0];
  return names.map((n, i) => (i === 0 ? n : `و ${n}`)).join('\n');
}

/**
 * Resolve the gender value to a symbol (letter or icon).
 *
 * The backend stores gender in Arabic: "ذكر" (male), "انثى" (female),
 * "ذكور و اناث" (both). This function converts to:
 *
 *   - 'letter': "M" / "F" / "M,F"
 *   - 'icon':   "♂" / "♀" / "♀♂"
 *
 * Also handles English values ("male", "female", "males and females").
 * Returns undefined if the gender value can't be recognized.
 */
function resolveGenderSymbol(
  rawGender: string | undefined,
  mode: 'letter' | 'icon',
): string | undefined {
  if (!rawGender) return undefined;
  const v = rawGender.trim().toLowerCase();

  if (v === 'ذكر' || v === 'male') {
    return mode === 'letter' ? 'M' : '♂';
  }
  if (v === 'انثى' || v === 'أنثى' || v === 'female') {
    return mode === 'letter' ? 'F' : '♀';
  }
  if (v.includes('ذكور') || v.includes('اناث') || v.includes('both') || v.includes('males')) {
    return mode === 'letter' ? 'M,F' : '♀♂';
  }
  return undefined;
}

/**
 * Resolve the `custom.deceased` dynamic field ("المغفور له").
 *
 * Display rules:
 *   - If status is "حي" or "احياء" (alive) → hide (return undefined)
 *   - If status is "احياء و متوفين" / "احياء و اموات" (mixed) → hide
 *   - If status is "متوفي" (deceased only) → display based on gender
 *     AND number of names in sacrificeFor:
 *     - Multiple names → "المغفور لهم بإذن الله"
 *     - Male (single)  → "المغفور له بإذن الله"
 *     - Female (single)→ "المغفور لها بإذن الله"
 *     - Both genders   → "المغفور لهم بإذن الله"
 *
 * The key rule: if there's any "alive" component in the status, display
 * nothing. Only pure "متوفي" triggers the prayer text.
 */
function resolveDeceasedText(
  orderData: OrderDataPayload,
): string | undefined {
  let rawStatus: string | undefined;
  if (orderData.reservation && orderData.reservation['isAlive']) {
    rawStatus = orderData.reservation['isAlive'];
  } else if (orderData.reservationData) {
    const entry = orderData.reservationData.find((r) => r.key === 'isAlive');
    rawStatus = entry?.value;
  }
  if (!rawStatus) return undefined;
  const status = rawStatus.trim().toLowerCase();

  // If there's any "alive" component ("حي", "احياء", "alive"), hide.
  // This covers: "حي", "احياء و متوفين", "احياء و اموات", "alive and dead".
  if (status.includes('حي') || status.includes('احياء') || status.includes('alive')) {
    return undefined;
  }

  // Only show for pure deceased ("متوفي", "deceased", "dead")
  const isDeceased =
    status === 'متوفي' ||
    status === 'deceased' ||
    status === 'dead' ||
    status.includes('متوفين') ||
    status.includes('اموات') ||
    status.includes('dead');
  if (!isDeceased) return undefined;

  // Read the sacrificeFor names to check if there are multiple
  let rawSacrificeFor: string | undefined;
  if (orderData.reservation && orderData.reservation['sacrificeFor']) {
    rawSacrificeFor = orderData.reservation['sacrificeFor'];
  } else if (orderData.reservationData) {
    const entry = orderData.reservationData.find((r) => r.key === 'sacrificeFor');
    rawSacrificeFor = entry?.value;
  }
  const nameCount = rawSacrificeFor
    ? rawSacrificeFor.split('\n').map((n) => n.trim()).filter(Boolean).length
    : 0;

  // Multiple names → always "المغفور لهم" regardless of gender
  if (nameCount > 1) {
    return 'المغفور لهم بإذن الله';
  }

  // Read the gender from reservation data
  let rawGender: string | undefined;
  if (orderData.reservation && orderData.reservation['gender']) {
    rawGender = orderData.reservation['gender'];
  } else if (orderData.reservationData) {
    const entry = orderData.reservationData.find((r) => r.key === 'gender');
    rawGender = entry?.value;
  }
  if (!rawGender) return undefined;
  const g = rawGender.trim().toLowerCase();

  if (g === 'ذكر' || g === 'male') {
    return 'المغفور له بإذن الله';
  }
  if (g === 'انثى' || g === 'أنثى' || g === 'female') {
    return 'المغفور لها بإذن الله';
  }
  if (g.includes('ذكور') || g.includes('اناث') || g.includes('both') || g.includes('males')) {
    return 'المغفور لهم بإذن الله';
  }
  return undefined;
}

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
      // Always prefer Arabic — templates are designed for Arabic content.
      return name.ar || name.en;
    }
    return (item as Record<string, unknown>)[key]?.toString();
  }
  if (variableId.startsWith('reservation.')) {
    const key = variableId.slice('reservation.'.length);
    let raw: string | undefined;
    if (orderData.reservation && orderData.reservation[key]) {
      raw = orderData.reservation[key];
    } else if (orderData.reservationData) {
      const entry = orderData.reservationData.find((r) => r.key === key);
      raw = entry?.value;
    }
    // sacrificeFor stores multiple names separated by newlines.
    // Format as: first name on its own line, then "و" prepended to each
    // subsequent name (Arabic "and" — e.g. "أحمد\nو محمد\nو علي").
    if (key === 'sacrificeFor' && raw) {
      return formatSacrificeForNames(raw);
    }
    return raw;
  }
  if (variableId.startsWith('ref.')) {
    const key = variableId.slice('ref.'.length);
    if (key === 'phoneNumbers') {
      return resolveRefPhoneNumbers(orderData);
    }
    if (key === 'referralId') {
      return orderData.referralId;
    }
    return undefined;
  }
  if (variableId.startsWith('custom.')) {
    const key = variableId.slice('custom.'.length);
    if (key === 'genderLetter' || key === 'genderIcon') {
      let rawGender: string | undefined;
      if (orderData.reservation && orderData.reservation['gender']) {
        rawGender = orderData.reservation['gender'];
      } else if (orderData.reservationData) {
        const entry = orderData.reservationData.find((r) => r.key === 'gender');
        rawGender = entry?.value;
      }
      const resolved = resolveGenderSymbol(rawGender, key === 'genderLetter' ? 'letter' : 'icon');
      return resolved;
    }
    if (key === 'deceased') {
      return resolveDeceasedText(orderData);
    }
    return undefined;
  }
  return undefined;
}

/**
 * Resolve the `ref.phoneNumbers` dynamic field.
 *
 * Returns all referral phone numbers as a multi-line string (one number
 * per row), with the order's ref number first, then the rest.
 *
 * Default refs (MNK-D, GHD-D) are NOT real refs — they share m1's phone
 * number. So we exclude them from the list and use m1 as the priority
 * when the order's ref is a default.
 *
 * Numbers are deduplicated by phone — if the same number appears under
 * multiple referralIds, it only shows once.
 */
function resolveRefPhoneNumbers(orderData: OrderDataPayload): string | undefined {
  const referrals = orderData.referrals;
  if (!referrals || referrals.length === 0) return undefined;

  let orderRef = orderData.referralId;
  if (!orderRef) {
    orderRef = orderData.source === 'ghadaq' ? 'GHD-D' : 'MNK-D';
  }

  // Default refs (MNK-D, GHD-D) share m1's phone number — map to m1
  const priorityRef =
    orderRef === 'MNK-D' || orderRef === 'GHD-D' ? 'm1' : orderRef;

  // Exclude the default ref entries (MNK-D, GHD-D) from the list — they
  // duplicate m1's number. Only keep real refs (m1, m2, m3, ...).
  const realRefs = referrals.filter(
    (r) => r.referralId !== 'MNK-D' && r.referralId !== 'GHD-D',
  );

  // Sort: matching ref first, then the rest by referralId
  const sorted = [...realRefs].sort((a, b) => {
    const aMatch = a.referralId === priorityRef ? 0 : 1;
    const bMatch = b.referralId === priorityRef ? 0 : 1;
    if (aMatch !== bMatch) return aMatch - bMatch;
    return a.referralId.localeCompare(b.referralId);
  });

  // Deduplicate by phone number — keep the first occurrence
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const r of sorted) {
    if (!seen.has(r.phone)) {
      seen.add(r.phone);
      unique.push(r.phone);
    }
  }

  return unique.join('\n');
}

/**
 * Business rules for when a dynamic field should be hidden (not rendered
 * on the design) even though the user added it to the template.
 *
 * Returns true if the field should be displayed, false if it should be
 * skipped entirely.
 *
 * Current rules:
 *   - item.quantity: only show if quantity >= 2 (a single item is the
 *     default, so showing "1" is redundant noise on the design)
 */
function shouldDisplayField(
  variableId: string,
  orderData: OrderDataPayload,
): boolean {
  if (variableId === 'item.quantity') {
    const item = orderData.item || orderData.items?.[0];
    const qty = item?.quantity;
    if (qty === undefined) return true; // can't resolve — let normal flow handle
    return qty >= 2;
  }
  return true;
}

// ─── Gender symbol drawing ───────────────────────────────────────────────

/**
 * Check if a string is a gender symbol (♂, ♀, ♀♂), ignoring any
 * leading RLM (U+200F) character. Returns the stripped symbol or
 * undefined if the string is not a gender symbol.
 */
function getGenderSymbol(text: string): string | undefined {
  // Strip RLM (U+200F) and whitespace
  const stripped = text.replace(/[\u200F\s]/g, '');
  if (stripped === '♂' || stripped === '♀' || stripped === '♂♀' || stripped === '♀♂') {
    return stripped;
  }
  return undefined;
}

/**
 * Measure the width of a gender symbol at the given font size.
 * Uses Arial (system font) which has the ♂ ♀ glyphs, since the
 * registered design fonts don't include them and measureText
 * returns 0 for unsupported glyphs.
 */
function measureGenderSymbol(ctx: SKRSContext2D, sym: string, size: number): number {
  const savedFont = ctx.font;
  ctx.font = `${size}px Arial`;
  const w = ctx.measureText(sym).width;
  ctx.font = savedFont;
  return w;
}

/**
 * Draw text or a gender symbol. If the text is a gender symbol (♂/♀/♀♂),
 * uses a system font (Arial) which has these Unicode glyphs, since the
 * registered design fonts (Expo Arabic, Satoshi) don't include them.
 * Otherwise, uses ctx.fillText with the current font.
 */
function fillTextOrSymbol(
  ctx: SKRSContext2D,
  text: string,
  x: number,
  y: number,
  size: number,
  color: string,
  originalFont: string,
): number {
  const sym = getGenderSymbol(text);
  if (sym) {
    // Use Arial (system font) which has the ♂ ♀ glyphs. This matches
    // what the browser renders in the editor (system font fallback).
    const weight = originalFont.includes('700') ? 'bold ' : '';
    ctx.font = `${weight}${size}px Arial`;
    ctx.fillStyle = color;
    ctx.fillText(sym, x, y);
    const w = ctx.measureText(sym).width;
    // Restore the original font
    ctx.font = originalFont;
    return w;
  }
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  return ctx.measureText(text).width;
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
 * Build the CSS font string with a specific font size.
 * For auto-fit layers, the rendered size differs from layer.fontSize.
 * e.g. "italic 700 24px 'Expo Arabic'"
 */
function buildFontStringWithSize(layer: TextLayer, size: number): string {
  const style = layer.italic ? 'italic ' : '';
  const weight = layer.bold ? 700 : layer.fontWeight || 400;
  return `${style}${weight} ${size}px '${layer.fontFamily}'`;
}

/**
 * Build a font string for a span (per-field style override).
 * Falls back to the layer-level values for properties the span doesn't set.
 */
function buildSpanFontString(span: { fontFamily?: string; bold?: boolean; italic?: boolean }, layer: TextLayer, size: number): string {
  const style = (span.italic ?? layer.italic) ? 'italic ' : '';
  const weight = (span.bold ?? layer.bold) ? 700 : (layer.fontWeight || 400);
  const family = span.fontFamily ?? layer.fontFamily;
  return `${style}${weight} ${size}px '${family}'`;
}

/**
 * Wrap text with per-span styling into lines.
 * Each returned line is an array of segments, where each segment has
 * its own text + style info (color, font, bold, italic). Word wrapping
 * tracks the actual width used on the current line so words from
 * different spans wrap correctly when the line fills up.
 *
 * Returns: Array of lines, each line = Array of { text, span } segments.
 */
function wrapTextWithSpans(
  ctx: SKRSContext2D,
  spans: Array<{ text: string; color?: string; fontFamily?: string; bold?: boolean; italic?: boolean }>,
  layer: TextLayer,
  size: number,
  maxWidth: number,
): Array<Array<{ text: string; span: { color?: string; fontFamily?: string; bold?: boolean; italic?: boolean } }>> {
  type Seg = { text: string; span: { color?: string; fontFamily?: string; bold?: boolean; italic?: boolean } };
  const lines: Array<Array<Seg>> = [];
  let currentLine: Array<Seg> = [];
  let currentWidth = 0;
  const spaceW = ctx.measureText(' ').width;

  for (const span of spans) {
    ctx.font = buildSpanFontString(span, layer, size);
    // Split into words, filter empty strings from double-space separators
    const words = span.text.split(' ').filter((w) => w !== '');

    for (const word of words) {
      const wordW = ctx.measureText(word).width;
      // Need a space gap if there's already content on the current line
      const gapW = currentWidth > 0 ? spaceW : 0;

      if (currentWidth + gapW + wordW <= maxWidth) {
        // Word fits on current line — merge into last segment if same span,
        // otherwise create a new segment
        const lastSeg = currentLine.length > 0 ? currentLine[currentLine.length - 1] : null;
        if (lastSeg && lastSeg.span === span) {
          lastSeg.text += ' ' + word;
        } else {
          currentLine.push({ text: word, span });
        }
        currentWidth += gapW + wordW;
      } else {
        // Word doesn't fit — flush current line, start a new one
        if (currentLine.length > 0) lines.push(currentLine);

        if (wordW > maxWidth) {
          // Word itself doesn't fit — character-level break
          let charText = '';
          for (const ch of word) {
            const test = charText + ch;
            if (ctx.measureText(test).width <= maxWidth) {
              charText = test;
            } else {
              if (charText) lines.push([{ text: charText, span }]);
              charText = ch;
            }
          }
          currentLine = charText ? [{ text: charText, span }] : [];
          currentWidth = charText ? ctx.measureText(charText).width : 0;
        } else {
          currentLine = [{ text: word, span }];
          currentWidth = wordW;
        }
      }
    }
  }
  if (currentLine.length > 0) lines.push(currentLine);

  return lines;
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

    // Word-wrap with character-level fallback (matches CSS
    // word-break: break-word + overflow-wrap: anywhere used in the
    // editor's DOM rendering). Filter empty strings from double-space
    // separators so wrapping measures real words only.
    const words = paragraph.split(' ').filter((w) => w !== '');
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      if (ctx.measureText(testLine).width <= maxWidth) {
        currentLine = testLine;
      } else {
        // Current line + word doesn't fit — push current line
        if (currentLine) lines.push(currentLine);
        // If the word itself doesn't fit, break it character by character
        if (ctx.measureText(word).width > maxWidth) {
          let charLine = '';
          for (const ch of word) {
            const testChar = charLine + ch;
            if (ctx.measureText(testChar).width <= maxWidth) {
              charLine = testChar;
            } else {
              if (charLine) lines.push(charLine);
              charLine = ch;
            }
          }
          currentLine = charLine;
        } else {
          currentLine = word;
        }
      }
    }
    if (currentLine) lines.push(currentLine);
  }

  return lines;
}

function renderTextLayer(ctx: SKRSContext2D, layer: TextLayer): void {
  if (!layer.text) return;

  const hasSpans = layer.spans && layer.spans.length > 0;

  ctx.fillStyle = layer.color;
  ctx.textBaseline = 'top';

  // ── Auto-fit mode ────────────────────────────────────────────────
  // When autoFit is true (text layers inflated from dynamic fields),
  // the font size is calculated to FILL the box. The saved fontSize
  // is ignored — the size is determined by box dimensions + text content.
  let renderFontSize = layer.fontSize;

  if (layer.autoFit) {
    const maxWidth = layer.width;
    const maxHeight = layer.height;
    const lineHeightRatio = layer.lineHeight || 1.2;

    function doesFit(size: number): boolean {
      if (hasSpans) {
        // Measure with spans — each span uses its own font for measuring
        const spanLines = wrapTextWithSpans(ctx, layer.spans!, layer, size, maxWidth);
        if (spanLines.length === 0) return true;
        const totalHeight = spanLines.length * size * lineHeightRatio;
        if (totalHeight > maxHeight) return false;
        // Check each line's total width (segment widths + gaps between them)
        const gapW = ctx.measureText(' ').width;
        for (const lineSegs of spanLines) {
          let lineW = 0;
          for (let s = 0; s < lineSegs.length; s++) {
            const seg = lineSegs[s];
            ctx.font = buildSpanFontString(seg.span, layer, size);
            lineW += ctx.measureText(seg.text).width;
            if (s > 0) lineW += gapW;
          }
          if (lineW > maxWidth) return false;
        }
        return true;
      }
      ctx.font = buildFontStringWithSize(layer, size);
      const lines = wrapText(ctx, layer.text, maxWidth);
      if (lines.length === 0) return true;
      const totalHeight = lines.length * size * lineHeightRatio;
      if (totalHeight > maxHeight) return false;
      for (const line of lines) {
        const sym = getGenderSymbol(line);
        const w = sym ? measureGenderSymbol(ctx, sym, size) : ctx.measureText(line).width;
        if (w > maxWidth) return false;
      }
      return true;
    }

    let lo = 1;
    let hi = Math.ceil(Math.max(maxWidth, maxHeight));
    let best = lo;
    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (doesFit(mid)) {
        best = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    renderFontSize = best;
  }

  // Determine wrapping width
  let wrapWidth: number;
  if (layer.autoFit) {
    wrapWidth = layer.width;
  } else {
    wrapWidth = layer.boxWidth && layer.boxWidth > 0 ? layer.boxWidth : 0;
  }

  const lineHeight = renderFontSize * (layer.lineHeight || 1.2);

  // ── Build lines (span-aware or plain) ────────────────────────────
  type LineSeg = { text: string; span: { color?: string; fontFamily?: string; bold?: boolean; italic?: boolean } };
  let lines: Array<LineSeg[]>;

  if (hasSpans) {
    lines = wrapTextWithSpans(ctx, layer.spans!, layer, renderFontSize, wrapWidth);
  } else {
    // Plain text — wrap into lines, then split each line into word segments
    // so the RTL drawing code can order words right-to-left.
    ctx.font = buildFontStringWithSize(layer, renderFontSize);
    const plainLines = wrapText(ctx, layer.text, wrapWidth);
    lines = plainLines.map((line) => {
      // Split the line into words — each word becomes a segment.
      // The RTL drawing code will position them right-to-left.
      const words = line.split(' ').filter((w) => w !== '');
      return words.map((w) => ({ text: w, span: {} as { color?: string; fontFamily?: string; bold?: boolean; italic?: boolean } }));
    });
  }

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
    const lineSegs = lines[i];
    const y = startY + i * lineHeight + (lineHeight - renderFontSize) / 2;

    // Calculate total line width (sum of segment widths + gaps between them)
    const spaceGap = ctx.measureText(' ').width;
    let lineWidth = 0;
    for (let s = 0; s < lineSegs.length; s++) {
      const seg = lineSegs[s];
      ctx.font = buildSpanFontString(seg.span, layer, renderFontSize);
      const segText = seg.text;
      const sym = getGenderSymbol(segText);
      lineWidth += sym ? measureGenderSymbol(ctx, sym, renderFontSize) : ctx.measureText(segText).width;
      if (s > 0) lineWidth += spaceGap; // gap between segments
    }

    // Horizontal alignment — compute starting x
    let x = 0;
    if (layer.align === 'center') {
      x = (layer.width - lineWidth) / 2;
    } else if (layer.align === 'right') {
      x = layer.width - lineWidth;
    }
    if (layer.direction === 'rtl' && layer.align === 'left') {
      x = layer.width - lineWidth;
    }

    // Draw each segment with its own font/color.
    // For RTL, draw from right to left so the first span (field 1)
    // appears on the right and subsequent spans flow leftward —
    // matching the natural Arabic reading order.
    // (spaceGap is already computed above for the line width calculation)

    if (layer.direction === 'rtl') {
      // RTL: start from the right edge of the line, draw leftward
      let drawX = x + lineWidth;
      for (let s = 0; s < lineSegs.length; s++) {
        const seg = lineSegs[s];
        ctx.font = buildSpanFontString(seg.span, layer, renderFontSize);
        const segColor = seg.span.color ?? layer.color;
        const sym = getGenderSymbol(seg.text);
        const segW = sym ? measureGenderSymbol(ctx, sym, renderFontSize) : ctx.measureText(seg.text).width;
        // Add gap before this segment (except the first on the line)
        if (s > 0) drawX -= spaceGap;
        drawX -= segW;
        fillTextOrSymbol(ctx, seg.text, drawX, y, renderFontSize, segColor, ctx.font);
      }
    } else {
      // LTR: start from the left, draw rightward
      for (let s = 0; s < lineSegs.length; s++) {
        const seg = lineSegs[s];
        ctx.font = buildSpanFontString(seg.span, layer, renderFontSize);
        const segColor = seg.span.color ?? layer.color;
        const sym = getGenderSymbol(seg.text);
        // Add gap before this segment (except the first on the line)
        if (s > 0) x += spaceGap;
        fillTextOrSymbol(ctx, seg.text, x, y, renderFontSize, segColor, ctx.font);
        x += sym ? measureGenderSymbol(ctx, sym, renderFontSize) : ctx.measureText(seg.text).width;
      }
    }
  }

  ctx.restore();
}

// ─── Image rendering ──────────────────────────────────────────────────────

async function renderImageLayer(ctx: SKRSContext2D, layer: ImageLayer): Promise<void> {
  if (!layer.uri || layer.uri.startsWith('blob:')) return;

  // Collage layers — render each cell
  if (layer.collage) {
    await renderCollageLayer(ctx, layer);
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
 * Render a collage layer — multiple image cells in a layout.
 * Uses the same COLLAGE_LAYOUTS definitions as the client-side editor
 * so the server-rendered output matches what the user sees in the editor.
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

  if (cells.length === 0) return;

  // Find the layout definition matching the collage's layout ID.
  // Fall back to the first layout that matches the cell count.
  const layout =
    COLLAGE_LAYOUTS.find((l) => l.id === layer.collage!.layout) ||
    COLLAGE_LAYOUTS.find((l) => l.cells.length === cells.length);
  if (!layout) return;

  const layoutCells = layout.cells;

  for (let i = 0; i < cells.length && i < layoutCells.length; i++) {
    const cell = cells[i];
    if (!cell?.uri) continue;

    const def = layoutCells[i];
    // Cell position/size from the layout definition (normalized 0-1),
    // scaled to the layer's pixel dimensions. The gap is applied as
    // padding inside each cell (matching the client-side rendering).
    const cellX = def.x * layer.width + gap / 2;
    const cellY = def.y * layer.height + gap / 2;
    const cellW = def.w * layer.width - gap;
    const cellH = def.h * layer.height - gap;

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
  // ── Resolve the text value (single or combined fields) ────────────
  // For combined fields, each field is resolved independently, display
  // rules applied per field, and visible values joined with a space.
  // The layer is skipped only if ALL fields are hidden/empty.
  const fieldStyles = layer.combinedFieldStyles ?? {};
  const combineDirection = layer.combineDirection ?? 'row';
  const hasIndividualStyles = Object.keys(fieldStyles).length > 0;

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
    // Single field — check display rules first
    if (!shouldDisplayField(layer.variableId, orderData)) return;
    const resolvedValue = resolveFieldValue(layer.variableId, orderData);
    if (isEmptyValue(resolvedValue)) return;
    const value = resolvedValue!;

    // Parse the value — could be a single URL or a JSON array of URLs
    // (multiple reservation pictures). Multiple images → render as grid.
    let imageUrls: string[] = [value];
    if (value.trim().startsWith('[')) {
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) {
          imageUrls = parsed.filter((u): u is string => typeof u === 'string' && u.length > 0);
        }
      } catch { /* not JSON — use as single URL */ }
    }

    const gap = 4;
    if (imageUrls.length > 1) {
      // Multiple images — render as a collage using the same layout
      // definitions as the editor. Pick a layout matching the image count.
      const layout = COLLAGE_LAYOUTS.find((l) => l.cells.length === imageUrls.length);
      if (layout) {
        // Fill background
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, layer.width, layer.height);

        for (let i = 0; i < imageUrls.length && i < layout.cells.length; i++) {
          const def = layout.cells[i];
          const cellX = def.x * layer.width + gap / 2;
          const cellY = def.y * layer.height + gap / 2;
          const cellW = def.w * layer.width - gap;
          const cellH = def.h * layer.height - gap;
          try {
            const img = await loadImageFromUrl(imageUrls[i]);
            ctx.save();
            if (layer.borderRadius && layer.borderRadius > 0) {
              roundedRectPath(ctx, cellX, cellY, cellW, cellH, layer.borderRadius);
              ctx.clip();
            } else {
              ctx.beginPath();
              ctx.rect(cellX, cellY, cellW, cellH);
              ctx.clip();
            }
            drawImageCover(ctx, img, cellX, cellY, cellW, cellH);
            ctx.restore();
          } catch {
            // Image failed — skip this cell
          }
        }
      } else {
        // Fallback: simple grid for counts without a matching layout
        const cols = imageUrls.length <= 2 ? 1 : 2;
        const rows = Math.ceil(imageUrls.length / cols);
        const cellW = (layer.width - gap * (cols + 1)) / cols;
        const cellH = (layer.height - gap * (rows + 1)) / rows;
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, layer.width, layer.height);
        for (let i = 0; i < imageUrls.length; i++) {
          const col = i % cols;
          const row = Math.floor(i / cols);
          const cellX = gap + col * (cellW + gap);
          const cellY = gap + row * (cellH + gap);
          try {
            const img = await loadImageFromUrl(imageUrls[i]);
            ctx.save();
            ctx.beginPath();
            ctx.rect(cellX, cellY, cellW, cellH);
            ctx.clip();
            drawImageCover(ctx, img, cellX, cellY, cellW, cellH);
            ctx.restore();
          } catch { /* skip */ }
        }
      }
    } else {
      // Single image — draw cover
      try {
        const img = await loadImageFromUrl(imageUrls[0]);
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
    }
  } else if (layer.combinedFields && layer.combinedFields.length > 0 && hasIndividualStyles && combineDirection === 'column') {
    // ── Column direction with individual styles: render each field ──
    // separately with its own font/color/bold/italic, stacked vertically
    // (equal height each). Row direction with individual styles falls
    // through to the joined-text path below — text flows naturally as a
    // single block instead of being split into equal-width sub-boxes.
    const allIds = [layer.variableId, ...layer.combinedFields];
    const fieldDirection = layer.direction || 'rtl';
    const visibleParts: { varId: string; value: string }[] = [];
    const rlm = '\u200F';
    for (const varId of allIds) {
      if (!shouldDisplayField(varId, orderData)) continue;
      const v = resolveFieldValue(varId, orderData);
      if (isEmptyValue(v)) continue;
      // Prepend RLM for RTL so bidi uses RTL base direction
      visibleParts.push({ varId, value: (fieldDirection === 'rtl' ? rlm : '') + v! });
    }
    if (visibleParts.length === 0) return; // all fields hidden

    const count = visibleParts.length;
    const fieldLineHeight = layer.lineHeight ?? 1.2;
    const fieldAlign = layer.align || 'center';
    const fieldVAlign = layer.verticalAlign || 'middle';

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, layer.width, layer.height);
    ctx.clip();
    ctx.textBaseline = 'top';

    for (let i = 0; i < count; i++) {
      const part = visibleParts[i];
      const fs = fieldStyles[part.varId] ?? {};
      const fieldFontFamily = fs.fontFamily ?? layer.fontFamily ?? 'Expo Arabic';
      const fieldFontWeight = (fs.bold ?? layer.bold ?? true) ? 700 : (layer.fontWeight || 400);
      const fieldItalic = fs.italic ?? layer.italic ?? false;
      const fieldColor = fs.color ?? layer.color;

      // Column direction: stack vertically, each field gets equal height
      const subX = 0;
      const subY = (layer.height / count) * i;
      const subW = layer.width;
      const subH = layer.height / count;

      // Auto-fit font size for this sub-box — no padding, matching DOM.
      const maxWidth = subW;
      const maxHeight = subH;

      function buildSubFont(size: number): string {
        const style = fieldItalic ? 'italic ' : '';
        return `${style}${fieldFontWeight} ${size}px '${fieldFontFamily}'`;
      }

      function doesSubFit(size: number): boolean {
        ctx.font = buildSubFont(size);
        const lines = wrapText(ctx, part.value, maxWidth);
        if (lines.length === 0) return true;
        const totalHeight = lines.length * size * fieldLineHeight;
        if (totalHeight > maxHeight) return false;
        for (const line of lines) {
          const sym = getGenderSymbol(line);
          const w = sym ? measureGenderSymbol(ctx, sym, size) : ctx.measureText(line).width;
          if (w > maxWidth) return false;
        }
        return true;
      }

      // Binary search [1, max(boxW, boxH)] — matches the DOM hook.
      let lo = 1;
      let hi = Math.ceil(Math.max(maxWidth, maxHeight));
      let bestSize = lo;
      while (lo <= hi) {
        const mid = Math.floor((lo + hi) / 2);
        if (doesSubFit(mid)) {
          bestSize = mid;
          lo = mid + 1;
        } else {
          hi = mid - 1;
        }
      }

      ctx.font = buildSubFont(bestSize);
      ctx.fillStyle = fieldColor;

      const lines = wrapText(ctx, part.value, maxWidth);
      const lineHeight = bestSize * fieldLineHeight;
      const totalHeight = lines.length * lineHeight;

      let startY = subY;
      if (fieldVAlign === 'middle') {
        startY = subY + (subH - totalHeight) / 2;
      } else if (fieldVAlign === 'bottom') {
        startY = subY + subH - totalHeight;
      }

      for (let li = 0; li < lines.length; li++) {
        const line = lines[li];
        const y = startY + li * lineHeight + (lineHeight - bestSize) / 2;
        const sym = getGenderSymbol(line);
        const lineWidth = sym ? measureGenderSymbol(ctx, sym, bestSize) : ctx.measureText(line).width;

        let x = subX;
        if (fieldAlign === 'center') {
          x = subX + (subW - lineWidth) / 2;
        } else if (fieldAlign === 'right') {
          x = subX + subW - lineWidth;
        }

        if (fieldDirection === 'rtl' && fieldAlign === 'left') {
          x = subX + subW - lineWidth;
        }

        fillTextOrSymbol(ctx, line, x, y, bestSize, fieldColor, ctx.font);
      }
    }

    ctx.restore();
  } else if (layer.combinedFields && layer.combinedFields.length > 0) {
    // ── Combined fields (row direction, or no individual styles) ──────
    // All visible field values are joined with a space (row) or newline
    // (column) and rendered as a single text block that flows naturally.
    // Row direction with individual styles also ends up here — text flow
    // correctness is more important than per-field colors in the output.
    const allIds = [layer.variableId, ...layer.combinedFields];
    const fieldDirection = layer.direction || 'rtl';
    const parts: string[] = [];
    for (const varId of allIds) {
      if (!shouldDisplayField(varId, orderData)) continue;
      const v = resolveFieldValue(varId, orderData);
      if (isEmptyValue(v)) continue;
      parts.push(v!);
    }
    if (parts.length === 0) return; // all fields hidden
    const separator = combineDirection === 'column' ? '\n' : '  ';
    // Keep original field order — the drawing code handles RTL ordering
    // by drawing words right-to-left within each line.
    const rlm = '\u200F';
    const value = (fieldDirection === 'rtl' ? rlm : '') + parts.join(separator);

    // Text dynamic field — auto-fit font size
    const fieldFontFamily = layer.fontFamily || 'Expo Arabic';
    const fieldFontWeight = layer.bold ?? true ? 700 : (layer.fontWeight || 400);
    const fieldItalic = layer.italic ?? false;
    const fieldLineHeight = layer.lineHeight ?? 1.2;
    const fieldAlign = layer.align || 'center';
    const fieldVAlign = layer.verticalAlign || 'middle';

    // No padding — match the DOM editor which uses clientWidth/clientHeight.
    const maxWidth = layer.width;
    const maxHeight = layer.height;

    function buildFieldFont(size: number): string {
      const style = fieldItalic ? 'italic ' : '';
      return `${style}${fieldFontWeight} ${size}px '${fieldFontFamily}'`;
    }

    function doesFontSizeFit(size: number): boolean {
      ctx.font = buildFieldFont(size);
      const lines = wrapText(ctx, value, maxWidth);
      if (lines.length === 0) return true;
      const totalHeight = lines.length * size * fieldLineHeight;
      if (totalHeight > maxHeight) return false;
      for (const line of lines) {
        const sym = getGenderSymbol(line);
        const w = sym ? measureGenderSymbol(ctx, sym, size) : ctx.measureText(line).width;
        if (w > maxWidth) return false;
      }
      return true;
    }

    // Binary search [1, max(boxW, boxH)] — matches the DOM hook.
    let lo = 1;
    let hi = Math.ceil(Math.max(maxWidth, maxHeight));
    let bestSize = lo;
    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (doesFontSizeFit(mid)) {
        bestSize = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }

    ctx.font = buildFieldFont(bestSize);
    ctx.fillStyle = layer.color;
    ctx.textBaseline = 'top';

    const lines = wrapText(ctx, value, maxWidth);
    const lineHeight = bestSize * fieldLineHeight;
    const totalHeight = lines.length * lineHeight;

    let startY = 0;
    if (fieldVAlign === 'middle') {
      startY = (layer.height - totalHeight) / 2;
    } else if (fieldVAlign === 'bottom') {
      startY = layer.height - totalHeight;
    }

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, layer.width, layer.height);
    ctx.clip();

    const spaceGap = ctx.measureText(' ').width;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const y = startY + i * lineHeight + (lineHeight - bestSize) / 2;

      // Split line into words for RTL word-level ordering
      const words = line.split(' ').filter((w) => w !== '');
      let lineWidth = 0;
      for (const w of words) {
        const sym = getGenderSymbol(w);
        lineWidth += sym ? measureGenderSymbol(ctx, sym, bestSize) : ctx.measureText(w).width;
      }
      lineWidth += (words.length - 1) * spaceGap;

      let x = 0;
      if (fieldAlign === 'center') {
        x = (layer.width - lineWidth) / 2;
      } else if (fieldAlign === 'right') {
        x = layer.width - lineWidth;
      }
      if (fieldDirection === 'rtl' && fieldAlign === 'left') {
        x = layer.width - lineWidth;
      }

      // Draw words — RTL: right-to-left, LTR: left-to-right
      if (fieldDirection === 'rtl') {
        let drawX = x + lineWidth;
        for (let w = 0; w < words.length; w++) {
          const sym = getGenderSymbol(words[w]);
          const wordW = sym ? measureGenderSymbol(ctx, sym, bestSize) : ctx.measureText(words[w]).width;
          if (w > 0) drawX -= spaceGap;
          drawX -= wordW;
          fillTextOrSymbol(ctx, words[w], drawX, y, bestSize, layer.color, ctx.font);
        }
      } else {
        for (const w of words) {
          const sym = getGenderSymbol(w);
          fillTextOrSymbol(ctx, w, x, y, bestSize, layer.color, ctx.font);
          x += (sym ? measureGenderSymbol(ctx, sym, bestSize) : ctx.measureText(w).width) + spaceGap;
        }
      }
    }

    ctx.restore();
  } else {
    // Single text field — check display rules first
    if (!shouldDisplayField(layer.variableId, orderData)) return;
    const resolvedValue = resolveFieldValue(layer.variableId, orderData);
    if (isEmptyValue(resolvedValue)) return;
    // Prepend RLM (U+200F) for RTL so the bidi algorithm uses RTL base
    // direction (same as combined fields above).
    const fieldDir = layer.direction || 'rtl';
    const rlm = '\u200F';
    const value = (fieldDir === 'rtl' ? rlm : '') + resolvedValue!;

    // Text dynamic field — auto-fit font size
    const fieldFontFamily = layer.fontFamily || 'Expo Arabic';
    const fieldFontWeight = layer.bold ?? true ? 700 : (layer.fontWeight || 400);
    const fieldItalic = layer.italic ?? false;
    const fieldLineHeight = layer.lineHeight ?? 1.2;
    const fieldAlign = layer.align || 'center';
    const fieldVAlign = layer.verticalAlign || 'middle';
    const fieldDirection = layer.direction || 'rtl';

    // No padding — match the DOM editor which uses clientWidth/clientHeight.
    const maxWidth = layer.width;
    const maxHeight = layer.height;

    function buildFieldFont(size: number): string {
      const style = fieldItalic ? 'italic ' : '';
      return `${style}${fieldFontWeight} ${size}px '${fieldFontFamily}'`;
    }

    function doesFontSizeFit(size: number): boolean {
      ctx.font = buildFieldFont(size);
      const lines = wrapText(ctx, value, maxWidth);
      if (lines.length === 0) return true;
      const totalHeight = lines.length * size * fieldLineHeight;
      if (totalHeight > maxHeight) return false;
      for (const line of lines) {
        const sym = getGenderSymbol(line);
        const w = sym ? measureGenderSymbol(ctx, sym, size) : ctx.measureText(line).width;
        if (w > maxWidth) return false;
      }
      return true;
    }

    // Binary search [1, max(boxW, boxH)] — matches the DOM hook.
    let lo = 1;
    let hi = Math.ceil(Math.max(maxWidth, maxHeight));
    let bestSize = lo;
    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (doesFontSizeFit(mid)) {
        bestSize = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }

    ctx.font = buildFieldFont(bestSize);
    ctx.fillStyle = layer.color;
    ctx.textBaseline = 'top';

    const lines = wrapText(ctx, value, maxWidth);
    const lineHeight = bestSize * fieldLineHeight;
    const totalHeight = lines.length * lineHeight;

    let startY = 0;
    if (fieldVAlign === 'middle') {
      startY = (layer.height - totalHeight) / 2;
    } else if (fieldVAlign === 'bottom') {
      startY = layer.height - totalHeight;
    }

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, layer.width, layer.height);
    ctx.clip();

    const spaceGap = ctx.measureText(' ').width;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const y = startY + i * lineHeight + (lineHeight - bestSize) / 2;

      const words = line.split(' ').filter((w) => w !== '');
      let lineWidth = 0;
      for (const w of words) {
        const sym = getGenderSymbol(w);
        lineWidth += sym ? measureGenderSymbol(ctx, sym, bestSize) : ctx.measureText(w).width;
      }
      lineWidth += (words.length - 1) * spaceGap;

      let x = 0;
      if (fieldAlign === 'center') {
        x = (layer.width - lineWidth) / 2;
      } else if (fieldAlign === 'right') {
        x = layer.width - lineWidth;
      }
      if (fieldDirection === 'rtl' && fieldAlign === 'left') {
        x = layer.width - lineWidth;
      }

      if (fieldDirection === 'rtl') {
        let drawX = x + lineWidth;
        for (let w = 0; w < words.length; w++) {
          const sym = getGenderSymbol(words[w]);
          const wordW = sym ? measureGenderSymbol(ctx, sym, bestSize) : ctx.measureText(words[w]).width;
          if (w > 0) drawX -= spaceGap;
          drawX -= wordW;
          fillTextOrSymbol(ctx, words[w], drawX, y, bestSize, layer.color, ctx.font);
        }
      } else {
        for (const w of words) {
          const sym = getGenderSymbol(w);
          fillTextOrSymbol(ctx, w, x, y, bestSize, layer.color, ctx.font);
          x += (sym ? measureGenderSymbol(ctx, sym, bestSize) : ctx.measureText(w).width) + spaceGap;
        }
      }
    }

    ctx.restore();
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

  // Render at 3x resolution for sharp, high-quality output.
  // The canvas is created at 3x dimensions, and we scale the context so
  // all drawing code can use the original (logical) coordinates.
  // For a 1080×1080 template, the output is 3240×3240 — crisp even
  // when displayed on high-DPI screens or printed.
  const canvas = createCanvas(
    template.canvasWidth * RENDER_SCALE,
    template.canvasHeight * RENDER_SCALE,
  );
  const ctx = canvas.getContext('2d');
  ctx.scale(RENDER_SCALE, RENDER_SCALE);

  // ── Quality settings ─────────────────────────────────────────────
  // High-quality image scaling (for uploaded photos + background)
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  // Best text rendering — critical for Arabic text with diacritics
  ctx.textRendering = 'optimizeLegibility';

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
  // @napi-rs/canvas uses a 0-100 quality scale (NOT 0-1 like browser
  // canvas or node-canvas). 100 = max quality. Combined with 3x render
  // scale, this produces sharp output with no JPEG artifacts.
  return canvas.toBuffer('image/jpeg', 40);
}
