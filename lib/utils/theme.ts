// RTL character ranges
const RTL_RANGES = [
  [0x0590, 0x05FF], // Hebrew
  [0x0600, 0x06FF], // Arabic
  [0x0750, 0x077F], // Arabic Supplement
  [0x08A0, 0x08FF], // Arabic Extended-A
  [0xFB50, 0xFDFF], // Arabic Presentation Forms-A
  [0xFE70, 0xFEFF], // Arabic Presentation Forms-B
];

export function isRTLText(text: string): boolean {
  if (!text) return false;

  for (let i = 0; i < text.length; i++) {
    const charCode = text.charCodeAt(i);

    for (const [start, end] of RTL_RANGES) {
      if (charCode >= start && charCode <= end) {
        return true;
      }
    }
  }

  return false;
}

export function getTextDirection(text: string): 'rtl' | 'ltr' | 'auto' {
  if (!text) return 'auto';
  return isRTLText(text) ? 'rtl' : 'ltr';
}

export function isArabicText(text: string): boolean {
  if (!text) return false;

  for (let i = 0; i < text.length; i++) {
    const charCode = text.charCodeAt(i);
    // Arabic range: 0x0600-0x06FF
    if (charCode >= 0x0600 && charCode <= 0x06FF) {
      return true;
    }
  }

  return false;
}

// Theme colors
export const BRAND_COLORS = {
  primary: '#0ea5e9',
  primaryDark: '#0284c7',
  primaryLight: '#e0f2fe',
  secondary: '#6366f1',
  accent: '#f59e0b',
  success: '#10b981',
  warning: '#f59e0b',
  error: '#ef4444',
  neutral: {
    50: '#f9fafb',
    100: '#f3f4f6',
    200: '#e5e7eb',
    300: '#d1d5db',
    400: '#9ca3af',
    500: '#6b7280',
    600: '#4b5563',
    700: '#374151',
    800: '#1f2937',
    900: '#111827',
  }
};

// Spacing scale
export const SPACING = {
  xs: '0.25rem',    // 4px
  sm: '0.5rem',     // 8px
  md: '1rem',       // 16px
  lg: '1.5rem',     // 24px
  xl: '2rem',       // 32px
  '2xl': '3rem',    // 48px
  '3xl': '4rem',    // 64px
};

// Border radius
export const BORDER_RADIUS = {
  none: '0',
  sm: '0.125rem',   // 2px
  md: '0.375rem',   // 6px
  lg: '0.5rem',     // 8px
  xl: '0.75rem',    // 12px
  '2xl': '1rem',    // 16px
  full: '9999px',
};

// Font sizes
export const FONT_SIZES = {
  xs: '0.75rem',    // 12px
  sm: '0.875rem',   // 14px
  base: '1rem',     // 16px
  lg: '1.125rem',   // 18px
  xl: '1.25rem',    // 20px
  '2xl': '1.5rem',  // 24px
  '3xl': '1.875rem', // 30px
  '4xl': '2.25rem', // 36px
};

// Font weights
export const FONT_WEIGHTS = {
  light: '300',
  normal: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
  extrabold: '800',
};

// Breakpoints
export const BREAKPOINTS = {
  sm: '640px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
  '2xl': '1536px',
};

// Z-index scale
export const Z_INDEX = {
  dropdown: 1000,
  sticky: 1020,
  fixed: 1030,
  modalBackdrop: 1040,
  modal: 1050,
  popover: 1060,
  tooltip: 1070,
};

// Transitions
export const TRANSITIONS = {
  default: '150ms cubic-bezier(0.4, 0, 0.2, 1)',
  fast: '100ms cubic-bezier(0.4, 0, 0.2, 1)',
  slow: '300ms cubic-bezier(0.4, 0, 0.2, 1)',
};

// Shadows
export const SHADOWS = {
  sm: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
  md: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
  lg: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
  xl: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
};

export function getTheme() {
  return {
    colors: BRAND_COLORS,
    spacing: SPACING,
    borderRadius: BORDER_RADIUS,
    fontSizes: FONT_SIZES,
    fontWeights: FONT_WEIGHTS,
    breakpoints: BREAKPOINTS,
    zIndex: Z_INDEX,
    transitions: TRANSITIONS,
    shadows: SHADOWS,
  };
}