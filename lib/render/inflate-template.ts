import { generateId } from '@/lib/utils/id';
import type {
  Project,
  AnyLayer,
  TextLayer,
  ImageLayer,
  DynamicFieldLayer,
} from '@/types';

// ─── Order data payload ───────────────────────────────────────────────────

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

// ─── Field resolution ─────────────────────────────────────────────────────

/**
 * Check if a resolved field value is "empty" / missing and should cause
 * the field to be hidden entirely (not displayed on the design).
 *
 * Treats the following as empty:
 *   - undefined / null
 *   - empty string or whitespace-only
 *   - the literal strings "none", "null", "undefined" (case-insensitive)
 *     — these can appear when a backend field has no value but is stored
 *     as a string rather than omitted
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
 *   - 'icon':   "♂" / "♀" / "♂♀"
 *
 * Also handles English values ("male", "female", "males and females")
 * in case the data comes from a different source.
 *
 * Returns undefined if the gender value can't be recognized.
 */
function resolveGenderSymbol(
  rawGender: string | undefined,
  mode: 'letter' | 'icon',
): string | undefined {
  if (!rawGender) return undefined;
  const v = rawGender.trim().toLowerCase();

  // Male: "ذكر" or "male"
  if (v === 'ذكر' || v === 'male') {
    return mode === 'letter' ? 'M' : '♂';
  }
  // Female: "انثى" or "أنثى" or "female"
  if (v === 'انثى' || v === 'أنثى' || v === 'female') {
    return mode === 'letter' ? 'F' : '♀';
  }
  // Both: "ذكور و اناث" or "males and females" or similar
  if (v.includes('ذكور') || v.includes('اناث') || v.includes('both') || v.includes('males')) {
    return mode === 'letter' ? 'M,F' : '♂♀';
  }
  return undefined;
}

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
      // Always prefer the Arabic name — templates are designed for
      // Arabic content. Fall back to English only if Arabic is missing.
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
    return undefined;
  }

  if (variableId.startsWith('custom.')) {
    const key = variableId.slice('custom.'.length);
    if (key === 'genderLetter' || key === 'genderIcon') {
      // Read the raw gender from reservation data
      let rawGender: string | undefined;
      if (orderData.reservation && orderData.reservation['gender']) {
        rawGender = orderData.reservation['gender'];
      } else if (orderData.reservationData) {
        const entry = orderData.reservationData.find((r) => r.key === 'gender');
        rawGender = entry?.value;
      }
      return resolveGenderSymbol(rawGender, key === 'genderLetter' ? 'letter' : 'icon');
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

  // Determine the order's ref, defaulting by source
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

  // Deduplicate by phone number — keep the first occurrence (which is
  // the priority ref's number if it appeared first after sorting)
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

// ─── Layer inflation ──────────────────────────────────────────────────────

/**
 * Business rules for when a dynamic field should be hidden (not displayed
 * on the design) even though the user added it to the template.
 *
 * Returns true if the field should be displayed, false if it should be
 * hidden.
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

/**
 * Convert a dynamic text field layer to a concrete text layer.
 *
 * The new text layer inherits the dynamic field's position, size,
 * font, color, and alignment. The `text` is set to the resolved value.
 *
 * If the value is missing/empty/none, the layer is hidden (visible: false)
 * — the placeholder is NOT shown. The design only shows fields that have
 * real data. The admin can still see the hidden layer in the editor's
 * layers panel and toggle it on manually if needed.
 *
 * Some fields also have display rules (e.g. item.quantity is hidden when
 * the quantity is 1) — if the rule says to hide, the layer is returned
 * with `visible: false` so it stays in the layer list but doesn't render.
 */
function inflateTextDynamicField(
  layer: DynamicFieldLayer,
  orderData: OrderDataPayload,
): TextLayer {
  const value = resolveFieldValue(layer.variableId, orderData);
  const display = shouldDisplayField(layer.variableId, orderData);
  const hasValue = !isEmptyValue(value);

  return {
    id: generateId(),
    type: 'text',
    name: layer.name,
    x: layer.x,
    y: layer.y,
    width: layer.width,
    height: layer.height,
    rotation: layer.rotation,
    opacity: layer.opacity,
    zIndex: layer.zIndex,
    // Hide if: layer was manually hidden, display rule says no, or no data
    visible: layer.visible && display && hasValue,
    locked: layer.locked,
    text: hasValue ? value! : layer.placeholder,
    // Use the dynamic field's text properties, with sensible defaults
    fontFamily: layer.fontFamily || 'Expo Arabic',
    fontWeight: layer.fontWeight || 700,
    fontSize: layer.fontSize, // reference only — autoFit overrides this
    color: layer.color,
    bold: layer.bold ?? true,
    italic: layer.italic ?? false,
    align: layer.align || 'center',
    verticalAlign: layer.verticalAlign || 'middle',
    lineHeight: layer.lineHeight ?? 1.2,
    direction: layer.direction || 'rtl',
    // Auto-fit: the font size is calculated to fill the box (grow or
    // shrink) based on the text content + box dimensions. The saved
    // fontSize is only a reference, not the actual rendered size.
    autoFit: true,
  };
}

/**
 * Convert a dynamic image field layer to a concrete image layer.
 *
 * The new image layer inherits the dynamic field's position and size.
 * The `uri` is set to the resolved image URL. If no image was resolved,
 * the layer is hidden (visible: false) so it doesn't show a broken
 * image icon in the editor.
 *
 * Natural dimensions default to the layer's display dimensions — the
 * editor will measure the actual image on load and update them.
 */
function inflateImageDynamicField(
  layer: DynamicFieldLayer,
  orderData: OrderDataPayload,
): ImageLayer {
  const value = resolveFieldValue(layer.variableId, orderData);
  const hasValue = !isEmptyValue(value);

  return {
    id: generateId(),
    type: 'image',
    name: layer.name,
    x: layer.x,
    y: layer.y,
    width: layer.width,
    height: layer.height,
    rotation: layer.rotation,
    opacity: layer.opacity,
    zIndex: layer.zIndex,
    // Hide the layer if no image was resolved — the user can manually
    // upload one in the editor if needed.
    visible: layer.visible && hasValue,
    locked: layer.locked,
    uri: hasValue ? value! : '',
    naturalWidth: layer.imageWidth || layer.width,
    naturalHeight: layer.imageHeight || layer.height,
    maskWidth: layer.width,
    maskHeight: layer.height,
    offsetX: 0,
    offsetY: 0,
    imageScale: 1,
    borderRadius: layer.borderRadius || 0,
    borderColor: layer.borderColor || 'transparent',
    borderWidth: layer.borderWidth || 0,
    flipX: false,
    flipY: false,
  };
}

/**
 * Inflate a single layer. Dynamic field layers are converted to
 * text/image layers; all other layers pass through unchanged.
 */
function inflateLayer(
  layer: AnyLayer,
  orderData: OrderDataPayload,
): AnyLayer {
  if (layer.type === 'dynamic_field') {
    if (layer.fieldType === 'image') {
      return inflateImageDynamicField(layer, orderData);
    }
    return inflateTextDynamicField(layer, orderData);
  }
  return layer;
}

// ─── Template → Design instance ───────────────────────────────────────────

export interface InflateOptions {
  /** Order number — included in the design instance's name for easy identification */
  orderNumber: string;
  /** Product name — included in the design instance's name */
  productName?: string;
  /** 1-based item index for multi-item orders */
  itemIndex?: number;
}

/**
 * Create a new `kind: 'design'` project from a booking template,
 * with all dynamic field layers inflated with the order's actual data.
 *
 * The resulting project is a concrete design — it has no dynamic field
 * layers, only text, image, and shape layers with real content. The
 * user can open it in the editor and tweak it without affecting the
 * template.
 *
 * The template itself is never modified.
 *
 * Naming convention:
 *   - Single item:  `{orderNumber} — {productName} — {templateName}`
 *   - Multi-item:   `{orderNumber} #{itemIndex} — {productName} — {templateName}`
 */
export function inflateTemplateToDesign(
  template: Project,
  orderData: Record<string, unknown>,
  options: InflateOptions,
): Project {
  const data = orderData as OrderDataPayload;
  const now = Date.now();

  // Build the design instance name
  const itemSuffix = options.itemIndex && options.itemIndex > 1
    ? ` #${options.itemIndex}`
    : '';
  const productNamePart = options.productName ? ` — ${options.productName}` : '';
  const name = `${options.orderNumber}${itemSuffix}${productNamePart} — ${template.name}`;

  // Inflate all layers — convert dynamic fields to concrete text/image layers
  const inflatedLayers = template.layers.map((layer) =>
    inflateLayer(layer, data),
  );

  return {
    ...template,
    // New identity — this is a new project, not the template
    id: generateId(),
    _id: undefined,

    // It's a design, not a template
    kind: 'design',
    templateType: undefined,
    bookingMeta: undefined,

    // Mark as order-generated so it's hidden from the main /projects
    // list and shown in the separate /orders-designs section instead.
    source: 'order',

    // Human-readable name for the projects list
    name,

    // Inflated layers with actual order data
    layers: inflatedLayers,

    // Reset sync/timestamp metadata
    createdAt: now,
    updatedAt: now,
    localModifiedAt: now,
    syncStatus: 'synced',
    syncedAt: now,

    // Clear transient fields
    bgUploadStatus: undefined,
    bgPendingFile: undefined,
  };
}
