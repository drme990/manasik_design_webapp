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
  // The backend may store multiple names separated by newlines OR commas.
  // Split on both (English + Arabic comma), then trim and filter empties.
  const names = raw
    .split(/[\n,،]/)
    .map((n) => n.trim())
    .filter(Boolean);
  if (names.length === 0) return raw.trim();
  if (names.length === 1) return names[0];
  // Join on one line: "محمد احمد ومحمود احمد وعلي احمد"
  // و is attached to the next name (no space after و), with a space before و.
  return names.map((n, i) => (i === 0 ? n : `و${n}`)).join(' ');
}

/**
 * Format an execution date from YYYY-MM-DD to "Weekday DD/MM/YYYY".
 * e.g. "2026-08-04" → "الثلاثاء 04/08/2026"
 *
 * Uses a hardcoded Arabic weekday array instead of toLocaleDateString,
 * which is unreliable on Vercel's serverless runtime.
 */
function formatExecutionDate(raw: string): string {
  const trimmed = raw.trim();
  const match = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!match) return trimmed;
  const [, yearStr, monthStr, dayStr] = match;
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const day = parseInt(dayStr, 10);
  const date = new Date(year, month - 1, day);
  const weekdays = [
    'الأحد',
    'الإثنين',
    'الثلاثاء',
    'الأربعاء',
    'الخميس',
    'الجمعة',
    'السبت',
  ];
  const weekday = weekdays[date.getDay()];
  const dd = String(day).padStart(2, '0');
  const mm = String(month).padStart(2, '0');
  return `${weekday} ${dd}/${mm}/${year}`;
}

/**
 * Resolve the gender value to a symbol (letter or icon).
 *
 * The backend stores gender in Arabic: "ذكر" (male), "انثى" (female),
 * "ذكور و اناث" (both). This function converts to:
 *
 *   - 'letter': "M" / "F" / undefined (both → hidden)
 *   - 'icon':   "♂" / "♀" / undefined (both → hidden)
 *
 * Also handles English values ("male", "female", "males and females")
 * in case the data comes from a different source.
 *
 * Returns undefined if the gender value can't be recognized or is "both"
 * (male + female together → the icon/letter is hidden, not shown).
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
  // Both: "ذكور و اناث" or "males and females" → hide entirely
  if (v.includes('ذكور') || v.includes('اناث') || v.includes('both') || v.includes('males')) {
    return undefined;
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
  // Read the isAlive status from reservation data
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
    ? rawSacrificeFor.split(/[\n,]/).map((n) => n.trim()).filter(Boolean).length
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

  // Male: "ذكر" or "male"
  if (g === 'ذكر' || g === 'male') {
    return 'المغفور له بإذن الله';
  }
  // Female: "انثى" or "أنثى" or "female"
  if (g === 'انثى' || g === 'أنثى' || g === 'female') {
    return 'المغفور لها بإذن الله';
  }
  // Both: "ذكور و اناث" or "males and females" or similar
  if (g.includes('ذكور') || g.includes('اناث') || g.includes('both') || g.includes('males')) {
    return 'المغفور لهم بإذن الله';
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
    // shortDuaa: strip newlines — the user may enter multi-line text but
    // it should render as a single flowing line that wraps naturally.
    if (key === 'shortDuaa' && raw) {
      return raw.replace(/[\r\n]+/g, ' ').trim();
    }
    // executionDate: format as "Weekday DD/MM/YYYY" (e.g. "الثلاثاء 04/08/2026")
    if (key === 'executionDate' && raw) {
      return formatExecutionDate(raw);
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
): TextLayer | TextLayer[] {
  // ── Combined fields: resolve each field independently, apply display
  //    rules per field, join visible values with a space separator.
  //    The layer is hidden only if ALL fields are hidden/empty.
  if (layer.combinedFields && layer.combinedFields.length > 0) {
    const allIds = [layer.variableId, ...layer.combinedFields];
    const fieldStyles = layer.combinedFieldStyles ?? {};
    const combineDirection = layer.combineDirection ?? 'row';

    // Resolve each field and keep track of which ones are visible
    const visibleParts: { varId: string; value: string }[] = [];
    for (const varId of allIds) {
      const value = resolveFieldValue(varId, orderData);
      const display = shouldDisplayField(varId, orderData);
      if (!display) continue;
      if (isEmptyValue(value)) continue;
      visibleParts.push({ varId, value: value! });
    }

    const hasAnyValue = visibleParts.length > 0;

    // If no field has individual style overrides, use the original
    // single-layer approach (join with space or newline).
    const hasIndividualStyles = Object.keys(fieldStyles).length > 0;

    // For 'row' direction, ALWAYS join into a single text layer — even
    // with individual styles. Splitting into equal-width sub-boxes causes
    // bad text wrapping (each sub-box wraps independently). Instead, the
    // text flows naturally as one block. Per-field styling (color/font/
    // bold/italic) is preserved via the `spans` array on the text layer,
    // which the canvas renderer uses to draw each segment with its own
    // style while keeping the text flowing inline.
    if (!hasIndividualStyles || combineDirection !== 'column') {
      const direction = layer.direction || 'rtl';
      const rlm = '\u200F';
      // For RTL, prepend RLM to EACH field value and use RLM+space as the
      // separator. This forces the bidi algorithm to treat every segment as
      // RTL, even when a field contains English text (names, numbers) that
      // would otherwise switch the base direction to LTR mid-text.
      const separator = combineDirection === 'column' ? '\n' : (direction === 'rtl' ? rlm + ' ' : ' ');

      // Always keep the original field order in `layer.text` so the
      // editor (which uses `direction: rtl` CSS) displays fields in the
      // correct visual order. The canvas renderer handles RTL ordering
      // in its drawing code (reversing line segments for RTL).
      const joinedText = visibleParts
        .map((p) => (direction === 'rtl' ? rlm + p.value : p.value))
        .join(separator);
      const textValue = hasAnyValue ? joinedText : layer.placeholder;

      // Build spans array for row direction (always, not just with
      // individual styles). Drawing each field as a separate fillText
      // call is critical for RTL — when fields are joined into a single
      // string, the bidi algorithm reorders words ACROSS field boundaries
      // (e.g. an English name in the middle causes Arabic words from
      // different fields to swap places). Spans keep the ORIGINAL field
      // order — the canvas renderer's RTL drawing code handles visual
      // ordering (first span on the right).
      const spans = (hasAnyValue && combineDirection !== 'column')
        ? visibleParts.map((part) => {
          const fs = fieldStyles[part.varId] ?? {};
          const rlmPrefix = direction === 'rtl' ? rlm : '';
          return {
            text: rlmPrefix + part.value,
            color: fs.color ?? layer.color,
            fontFamily: fs.fontFamily ?? layer.fontFamily ?? 'Expo Arabic',
            bold: fs.bold ?? layer.bold ?? true,
            italic: fs.italic ?? layer.italic ?? false,
          };
        })
        : undefined;

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
        visible: layer.visible && hasAnyValue,
        locked: layer.locked,
        text: textValue,
        spans,
        fontFamily: layer.fontFamily || 'Expo Arabic',
        fontWeight: layer.fontWeight || 700,
        fontSize: layer.fontSize,
        color: layer.color,
        bold: layer.bold ?? true,
        italic: layer.italic ?? false,
        align: layer.align || 'center',
        verticalAlign: layer.verticalAlign || 'middle',
        lineHeight: layer.lineHeight ?? 1.2,
        direction: layer.direction || 'rtl',
        autoFit: true,
      };
    }

    // ── Column direction with individual styles: one text layer per ──
    // visible field, stacked vertically (equal height each).
    if (!hasAnyValue) {
      // Return a single hidden layer
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
        visible: false,
        locked: layer.locked,
        text: layer.placeholder,
        fontFamily: layer.fontFamily || 'Expo Arabic',
        fontWeight: layer.fontWeight || 700,
        fontSize: layer.fontSize,
        color: layer.color,
        bold: layer.bold ?? true,
        italic: layer.italic ?? false,
        align: layer.align || 'center',
        verticalAlign: layer.verticalAlign || 'middle',
        lineHeight: layer.lineHeight ?? 1.2,
        direction: layer.direction || 'rtl',
        autoFit: true,
      };
    }

    const count = visibleParts.length;
    const direction = layer.direction || 'rtl';
    const rlm = '\u200F';
    const layers: TextLayer[] = visibleParts.map((part, i) => {
      const fs = fieldStyles[part.varId] ?? {};
      const fieldFontFamily = fs.fontFamily ?? layer.fontFamily ?? 'Expo Arabic';
      const fieldBold = fs.bold ?? layer.bold ?? true;
      const fieldItalic = fs.italic ?? layer.italic ?? false;
      const fieldColor = fs.color ?? layer.color;

      // Column direction: stack vertically, each field gets equal height
      const subX = layer.x;
      const subY = layer.y + (layer.height / count) * i;
      const subW = layer.width;
      const subH = layer.height / count;

      return {
        id: generateId(),
        type: 'text',
        name: `${layer.name} (${part.varId})`,
        x: subX,
        y: subY,
        width: subW,
        height: subH,
        rotation: layer.rotation,
        opacity: layer.opacity,
        zIndex: layer.zIndex,
        visible: layer.visible,
        locked: layer.locked,
        text: direction === 'rtl' ? rlm + part.value : part.value,
        fontFamily: fieldFontFamily,
        fontWeight: layer.fontWeight || 700,
        fontSize: layer.fontSize,
        color: fieldColor,
        bold: fieldBold,
        italic: fieldItalic,
        align: layer.align || 'center',
        verticalAlign: layer.verticalAlign || 'middle',
        lineHeight: layer.lineHeight ?? 1.2,
        direction: layer.direction || 'rtl',
        autoFit: true,
      };
    });

    return layers;
  }

  // ── Single field (original behavior) ──────────────────────────────
  const value = resolveFieldValue(layer.variableId, orderData);
  const display = shouldDisplayField(layer.variableId, orderData);
  const hasValue = !isEmptyValue(value);
  const direction = layer.direction || 'rtl';
  // Prepend RLM (U+200F) for RTL text so the bidi algorithm uses
  // RTL as the base direction (same as combined fields above).
  const rlm = '\u200F';
  const textValue = hasValue
    ? (direction === 'rtl' ? rlm + value! : value!)
    : layer.placeholder;

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
    text: textValue,
    // Use the dynamic field's text properties, with sensible defaults
    fontFamily: layer.fontFamily || 'Expo Arabic',
    fontWeight: layer.fontWeight || 700,
    fontSize: layer.fontSize,
    color: layer.color,
    bold: layer.bold ?? true,
    italic: layer.italic ?? false,
    align: layer.align || 'center',
    verticalAlign: layer.verticalAlign || 'middle',
    lineHeight: layer.lineHeight ?? 1.2,
    direction: layer.direction || 'rtl',
    // Keep autoFit: true in the DB — the design editor's loading code
    // detects this, strips it, and marks the layer with _needsInitialFit
    // so the box gets shrunk to fit the text on first render. The
    // server-side renderer uses autoFit to size the text for the initial
    // JPG export (before the admin edits it in the design editor).
    autoFit: true,
  };
}

/**
 * Parse a resolved photo value into an array of image URLs.
 * The value can be:
 *  - A single URL string
 *  - A JSON-encoded array of URL strings (multiple reservation pictures)
 *  - undefined / empty (no photo)
 */
function parsePhotoUrls(value: string | undefined): string[] {
  if (!value || isEmptyValue(value)) return [];
  const trimmed = value.trim();
  // JSON array of URLs
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.filter((u): u is string => typeof u === 'string' && u.length > 0);
      }
    } catch { /* not JSON — fall through */ }
  }
  // Single URL
  return [value];
}

/**
 * Convert a dynamic image field layer to a concrete image layer.
 *
 * The new image layer inherits the dynamic field's position and size.
 * If a single image is resolved, `uri` is set to that URL.
 * If multiple images are resolved (e.g. reservation.photo with multiple
 * pictures), the layer becomes a collage containing all images.
 * If no image is resolved, the layer is hidden (visible: false).
 *
 * Natural dimensions default to the layer's display dimensions — the
 * editor will measure the actual image on load and update them.
 */
function inflateImageDynamicField(
  layer: DynamicFieldLayer,
  orderData: OrderDataPayload,
): ImageLayer {
  const value = resolveFieldValue(layer.variableId, orderData);
  const urls = parsePhotoUrls(value);
  const hasValue = urls.length > 0;

  // Pick a collage layout that fits the number of images
  function pickCollageLayout(count: number): string {
    if (count <= 1) return '1';
    if (count === 2) return '2h';
    if (count === 3) return '3h';
    return '4grid';
  }

  const baseImageLayer: ImageLayer = {
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
    visible: layer.visible && hasValue,
    locked: layer.locked,
    uri: hasValue ? urls[0] : '',
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

  // Multiple images → create a collage
  if (urls.length > 1) {
    const layoutId = pickCollageLayout(urls.length);
    baseImageLayer.collage = {
      uris: urls,
      layout: layoutId,
      cells: urls.map((uri) => ({
        uri,
        offsetX: 0,
        offsetY: 0,
        scale: 1,
      })),
      gap: layer.collageGap ?? 4,
      bgColor: '#000000',
      containerRadius: layer.borderRadius || 0,
    };
  }

  return baseImageLayer;
}

/**
 * Inflate a single layer. Dynamic field layers are converted to
 * text/image layers; all other layers pass through unchanged.
 */
function inflateLayer(
  layer: AnyLayer,
  orderData: OrderDataPayload,
): AnyLayer | AnyLayer[] {
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

  // Inflate all layers — convert dynamic fields to concrete text/image layers.
  // A single dynamic field can inflate into multiple layers (combined fields
  // with individual styles), so we flatten the result.
  const inflatedLayers = template.layers.flatMap((layer) => {
    const result = inflateLayer(layer, data);
    return Array.isArray(result) ? result : [result];
  });

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
