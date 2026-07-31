/**
 * Order field definitions — the "order shape".
 *
 * These fields mirror the real backend Order model
 * (backend/lib/models/Order.ts) and the reservation field presets
 * (backend/lib/reservation-fields.ts). Each field maps to a piece of
 * data that will be filled in from a customer order at template
 * generation time.
 *
 * The user picks from this predefined list when authoring a booking
 * template — they cannot create arbitrary field names — so that every
 * template uses consistent, known variables that the future inflation
 * engine can map directly to order data.
 *
 * Field IDs match the backend's data paths so the inflation engine can
 * resolve them without a lookup table:
 *   - billing.*       → order.billingData.{fullName|email|phone|country}
 *   - order.*         → order.{orderNumber|totalAmount|...}
 *   - item.*          → order.items[0].{productName|quantity}
 *   - reservation.*   → order.reservationData[key].value
 *   - ref.*           → referral phone numbers (from the referrals collection)
 *   - custom.*        → derived/computed fields (gender symbol, etc.)
 *
 * Fields are grouped into categories for the picker UI:
 *   - 'order'        → billing, order-level, and item fields
 *   - 'reservation'  → reservation data fields (intention, photo, etc.)
 *   - 'custom'       → derived fields (ref numbers, gender symbol, etc.)
 */

export type OrderFieldType = 'text' | 'image';

/** Category label shown as a section header in the field picker */
export type OrderFieldCategory = 'order' | 'reservation' | 'custom';

export interface OrderField {
  /** Stable identifier — stored on the DynamicFieldLayer as variableId.
   *  Matches the backend data path so the inflation engine can resolve it. */
  id: string;
  /** Arabic label shown in the field picker UI */
  label: string;
  /** Field type — 'text' renders as a text layer, 'image' as an image layer */
  type: OrderFieldType;
  /** Default placeholder text shown on the canvas before data is filled in */
  placeholder: string;
  /** Category — used to group fields in the picker UI with section headers */
  category: OrderFieldCategory;
}

/* ── Billing data (customer info) ──────────────────────────────────── */
const BILLING_FIELDS: OrderField[] = [
  { id: 'billing.fullName', label: 'اسم العميل', type: 'text', placeholder: 'اسم العميل', category: 'order' },
  { id: 'billing.email', label: 'البريد الإلكتروني', type: 'text', placeholder: 'example@mail.com', category: 'order' },
  { id: 'billing.phone', label: 'رقم الهاتف', type: 'text', placeholder: '+9665...', category: 'order' },
  { id: 'billing.country', label: 'الدولة', type: 'text', placeholder: 'الدولة', category: 'order' },
];

/* ── Order-level fields ────────────────────────────────────────────── */
const ORDER_FIELDS_LIST: OrderField[] = [
  { id: 'order.orderNumber', label: 'رقم الطلب', type: 'text', placeholder: '#12345', category: 'order' },
  { id: 'order.totalAmount', label: 'المبلغ الإجمالي', type: 'text', placeholder: '0.00', category: 'order' },
  { id: 'order.paidAmount', label: 'المبلغ المدفوع', type: 'text', placeholder: '0.00', category: 'order' },
  { id: 'order.remainingAmount', label: 'المبلغ المتبقي', type: 'text', placeholder: '0.00', category: 'order' },
  { id: 'order.currency', label: 'العملة', type: 'text', placeholder: 'SAR', category: 'order' },
  { id: 'order.status', label: 'حالة الطلب', type: 'text', placeholder: 'paid', category: 'order' },
];

/* ── First item fields ─────────────────────────────────────────────── */
const ITEM_FIELDS: OrderField[] = [
  { id: 'item.productName', label: 'اسم المنتج', type: 'text', placeholder: 'اسم المنتج', category: 'order' },
  // item.quantity has a display rule: only shown when quantity >= 2.
  // A single item is the default, so showing "1" is redundant noise.
  // See shouldDisplayField() in inflate-template.ts + canvas-renderer.ts.
  { id: 'item.quantity', label: 'الكمية', type: 'text', placeholder: '2', category: 'order' },
];

/* ── Reservation data (per-order dynamic answers) ──────────────────── */
/* These match the reservation field presets in the backend:
 *   intention, sacrificeFor, gender, isAlive, shortDuaa, photo, executionDate
 * Only `photo` is an image; the rest are text. */
const RESERVATION_FIELDS: OrderField[] = [
  { id: 'reservation.intention', label: 'النية', type: 'text', placeholder: 'عقيقة', category: 'reservation' },
  { id: 'reservation.sacrificeFor', label: 'اسم الشخص المؤدى عنه', type: 'text', placeholder: 'اسم الشخص', category: 'reservation' },
  { id: 'reservation.gender', label: 'الجنس', type: 'text', placeholder: 'ذكر', category: 'reservation' },
  { id: 'reservation.isAlive', label: 'الحالة', type: 'text', placeholder: 'حي', category: 'reservation' },
  { id: 'reservation.shortDuaa', label: 'دعاء مختصر', type: 'text', placeholder: 'دعاء مختصر', category: 'reservation' },
  { id: 'reservation.photo', label: 'صورة العميل', type: 'image', placeholder: 'صورة العميل', category: 'reservation' },
  { id: 'reservation.executionDate', label: 'تاريخ التنفيذ', type: 'text', placeholder: 'تاريخ التنفيذ', category: 'reservation' },
];

/* ── Custom / derived fields ───────────────────────────────────────────
 * These fields don't map directly to a single DB value — they're
 * computed/derived from order data at resolution time.
 *
 * - ref.phoneNumbers: all referral phone numbers, order's ref first
 * - custom.genderLetter: gender as a single letter (M / F / M,F)
 * - custom.genderIcon: gender as a Unicode symbol (♂ / ♀ / ♂♀)
 *
 * The gender fields read the raw `reservation.gender` value (which is
 * stored in Arabic: "ذكر", "انثى", "ذكور و اناث") and convert it to
 * the letter or icon representation. See resolveGenderSymbol() in
 * inflate-template.ts + canvas-renderer.ts.
 */
const REFERRAL_FIELDS: OrderField[] = [
  { id: 'ref.phoneNumbers', label: 'أرقام المراجع', type: 'text', placeholder: '+9665...\n+9665...', category: 'custom' },
];

const REFERRAL_ID_FIELD: OrderField = {
  id: 'ref.referralId',
  label: 'كود المرجع',
  type: 'text',
  placeholder: 'm1',
  category: 'order',
};

const GENDER_FIELDS: OrderField[] = [
  { id: 'custom.genderLetter', label: 'الجنس (حرف)', type: 'text', placeholder: 'M', category: 'custom' },
  { id: 'custom.genderIcon', label: 'الجنس (أيقونة)', type: 'text', placeholder: '♂', category: 'custom' },
  { id: 'custom.deceased', label: 'المغفور له', type: 'text', placeholder: 'المغفور له بإذن الله', category: 'custom' },
];

/**
 * The canonical list of all dynamic fields derived from the backend
 * Order model. Add new fields here when the order schema grows.
 */
export const ORDER_FIELDS: OrderField[] = [
  ...BILLING_FIELDS,
  ...ORDER_FIELDS_LIST,
  ...ITEM_FIELDS,
  REFERRAL_ID_FIELD,
  ...RESERVATION_FIELDS,
  ...REFERRAL_FIELDS,
  ...GENDER_FIELDS,
];

/** Quick lookup by id */
export const ORDER_FIELD_MAP: Record<string, OrderField> = Object.fromEntries(
  ORDER_FIELDS.map((f) => [f.id, f]),
);

/** Get only the text-type fields */
export const TEXT_ORDER_FIELDS = ORDER_FIELDS.filter((f) => f.type === 'text');

/** Get only the image-type fields */
export const IMAGE_ORDER_FIELDS = ORDER_FIELDS.filter((f) => f.type === 'image');

/* ── Category labels (Arabic) for the field picker UI ────────────────── */
export const CATEGORY_LABELS: Record<OrderFieldCategory, string> = {
  order: 'حقول الطلب',
  reservation: 'حقول الحجز',
  custom: 'حقول مخصصة',
};

/**
 * Fields grouped by category, preserving insertion order within each
 * category. Used by the DynamicFieldsDrawer to render section headers.
 */
export const ORDER_FIELDS_BY_CATEGORY: { category: OrderFieldCategory; label: string; fields: OrderField[] }[] = [
  { category: 'order', label: CATEGORY_LABELS.order, fields: [...BILLING_FIELDS, ...ORDER_FIELDS_LIST, ...ITEM_FIELDS, REFERRAL_ID_FIELD] },
  { category: 'reservation', label: CATEGORY_LABELS.reservation, fields: RESERVATION_FIELDS },
  { category: 'custom', label: CATEGORY_LABELS.custom, fields: [...REFERRAL_FIELDS, ...GENDER_FIELDS] },
];
