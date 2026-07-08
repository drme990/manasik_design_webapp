export const PREDEFINED_VARIABLES = [
  { id: 'customer_name', label: 'اسم العميل', type: 'text' },
  { id: 'phone', label: 'رقم الهاتف', type: 'text' },
  { id: 'quantity', label: 'الكمية', type: 'number' },
  { id: 'date', label: 'التاريخ', type: 'date' },
  { id: 'price', label: 'السعر', type: 'number' },
];

export const VARIANT_LABELS = {
  single: 'قطعة واحدة',
  double: 'قطعتين',
  multiple: 'أكثر من قطعتين',
} as const;

export const MODEL_LABELS = {
  withImage: 'موديل بصورة',
  withoutImage: 'موديل بدون صورة',
} as const;