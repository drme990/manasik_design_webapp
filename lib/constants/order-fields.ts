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
 *   - billing.*   → order.billingData.{fullName|email|phone|country}
 *   - order.*     → order.{orderNumber|totalAmount|...}
 *   - item.*      → order.items[0].{productName|quantity}
 *   - reservation.* → order.reservationData[key].value
 */

export type OrderFieldType = 'text' | 'image';

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
}

/* ── Billing data (customer info) ──────────────────────────────────── */
const BILLING_FIELDS: OrderField[] = [
  { id: 'billing.fullName', label: 'اسم العميل', type: 'text', placeholder: 'اسم العميل' },
  { id: 'billing.email', label: 'البريد الإلكتروني', type: 'text', placeholder: 'example@mail.com' },
  { id: 'billing.phone', label: 'رقم الهاتف', type: 'text', placeholder: '+9665...' },
  { id: 'billing.country', label: 'الدولة', type: 'text', placeholder: 'الدولة' },
];

/* ── Order-level fields ────────────────────────────────────────────── */
const ORDER_FIELDS_LIST: OrderField[] = [
  { id: 'order.orderNumber', label: 'رقم الطلب', type: 'text', placeholder: '#12345' },
  { id: 'order.totalAmount', label: 'المبلغ الإجمالي', type: 'text', placeholder: '0.00' },
  { id: 'order.paidAmount', label: 'المبلغ المدفوع', type: 'text', placeholder: '0.00' },
  { id: 'order.remainingAmount', label: 'المبلغ المتبقي', type: 'text', placeholder: '0.00' },
  { id: 'order.currency', label: 'العملة', type: 'text', placeholder: 'SAR' },
  { id: 'order.status', label: 'حالة الطلب', type: 'text', placeholder: 'paid' },
];

/* ── First item fields ─────────────────────────────────────────────── */
const ITEM_FIELDS: OrderField[] = [
  { id: 'item.productName', label: 'اسم المنتج', type: 'text', placeholder: 'اسم المنتج' },
  { id: 'item.quantity', label: 'الكمية', type: 'text', placeholder: '1' },
];

/* ── Reservation data (per-order dynamic answers) ──────────────────── */
/* These match the reservation field presets in the backend:
 *   intention, sacrificeFor, gender, isAlive, shortDuaa, photo, executionDate
 * Only `photo` is an image; the rest are text. */
const RESERVATION_FIELDS: OrderField[] = [
  { id: 'reservation.intention', label: 'النية', type: 'text', placeholder: 'عقيقة' },
  { id: 'reservation.sacrificeFor', label: 'اسم الشخص المؤدى عنه', type: 'text', placeholder: 'اسم الشخص' },
  { id: 'reservation.gender', label: 'الجنس', type: 'text', placeholder: 'ذكر' },
  { id: 'reservation.isAlive', label: 'الحالة', type: 'text', placeholder: 'حي' },
  { id: 'reservation.shortDuaa', label: 'دعاء مختصر', type: 'text', placeholder: 'دعاء مختصر' },
  { id: 'reservation.photo', label: 'صورة العميل', type: 'image', placeholder: 'صورة العميل' },
  { id: 'reservation.executionDate', label: 'تاريخ التنفيذ', type: 'text', placeholder: 'تاريخ التنفيذ' },
];

/**
 * The canonical list of all dynamic fields derived from the backend
 * Order model. Add new fields here when the order schema grows.
 */
export const ORDER_FIELDS: OrderField[] = [
  ...BILLING_FIELDS,
  ...ORDER_FIELDS_LIST,
  ...ITEM_FIELDS,
  ...RESERVATION_FIELDS,
];

/** Quick lookup by id */
export const ORDER_FIELD_MAP: Record<string, OrderField> = Object.fromEntries(
  ORDER_FIELDS.map((f) => [f.id, f]),
);

/** Get only the text-type fields */
export const TEXT_ORDER_FIELDS = ORDER_FIELDS.filter((f) => f.type === 'text');

/** Get only the image-type fields */
export const IMAGE_ORDER_FIELDS = ORDER_FIELDS.filter((f) => f.type === 'image');
