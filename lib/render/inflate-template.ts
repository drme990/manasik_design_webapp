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
}

// ─── Field resolution ─────────────────────────────────────────────────────

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

// ─── Layer inflation ──────────────────────────────────────────────────────

/**
 * Convert a dynamic text field layer to a concrete text layer.
 *
 * The new text layer inherits the dynamic field's position, size,
 * font, color, and alignment. The `text` is set to the resolved value,
 * or the placeholder if the value couldn't be resolved (so the user
 * sees something in the editor instead of an empty box).
 */
function inflateTextDynamicField(
  layer: DynamicFieldLayer,
  orderData: OrderDataPayload,
): TextLayer {
  const value = resolveFieldValue(layer.variableId, orderData);

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
    visible: layer.visible,
    locked: layer.locked,
    text: value || layer.placeholder,
    fontFamily: 'Expo Arabic',
    fontWeight: 700,
    fontSize: layer.fontSize,
    color: layer.color,
    bold: true,
    italic: false,
    align: 'center',
    verticalAlign: 'middle',
    lineHeight: 1.2,
    direction: 'rtl',
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
    visible: layer.visible && !!value,
    locked: layer.locked,
    uri: value || '',
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
