import ar from '@/messages/ar.json';

type Dict = Record<string, unknown>;

const messages = ar as Dict;
export const locale = 'ar';

/**
 * Resolves a dot-separated key path (e.g. "editor.toolbars.image.title")
 * against the messages dictionary. Returns the raw string value, or the
 * key itself if not found (makes missing keys obvious during development).
 */
function resolveKey(path: string): string {
  const parts = path.split('.');
  let current: unknown = messages;

  for (const part of parts) {
    if (current && typeof current === 'object' && part in (current as Dict)) {
      current = (current as Dict)[part];
    } else {
      return path;
    }
  }

  return typeof current === 'string' ? current : path;
}

/**
 * Replaces {placeholder} tokens in a string with values from the params object.
 */
function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, key: string) =>
    key in params ? String(params[key]) : `{${key}}`
  );
}

/**
 * Drop-in replacement for next-intl's useTranslations.
 * Accepts a namespace prefix and returns a function that resolves keys
 * relative to that namespace, with optional {var} interpolation.
 *
 * Works in both Server and Client components (no React hooks used internally).
 */
export function useTranslations(namespace?: string) {
  const t = (key: string, params?: Record<string, string | number>): string => {
    const fullPath = namespace ? `${namespace}.${key}` : key;
    return interpolate(resolveKey(fullPath), params);
  };
  return t;
}

/**
 * Drop-in replacement for next-intl's useLocale.
 * Always returns 'ar' since the app is Arabic-only.
 */
export function useLocale(): string {
  return locale;
}
