/**
 * Product name formatting utilities.
 *
 * Product names can contain "design-only" text wrapped in `[[]]` markers.
 * Example: "حلوى للأطفال [[تجربة]]"
 *
 * - In the **design app**, text inside `[[]]` is removed entirely:
 *   "حلوى للأطفال [[تجربة]]" → "حلوى للأطفال"
 *   This text is meant for admin/ops use only and should never appear
 *   on the rendered design output.
 *
 * - In the **admin panel** and customer-facing apps (manasik, ghadaq),
 *   only the `[[]]` markers are removed, keeping the inner text:
 *   "حلوى للأطفال [[تجربة]]" → "حلوى للأطفال تجربة"
 *   (handled separately in the admin panel codebase)
 */

/**
 * Remove all `[[...]]` segments from a string (markers + inner text).
 * Handles multiple occurrences and nested-free content.
 *
 * "حلوى [[تجربة]] كبيرة" → "حلوى  كبيرة"
 * "No markers here" → "No markers here"
 * "" → ""
 */
export function stripDesignOnlyText(text: string | undefined | null): string {
  if (!text) return '';
  // Remove [[...]] (non-greedy, handles multiple occurrences)
  return text.replace(/\[\[[^\]]*\]\]/g, '').trim();
}

/**
 * Remove `[[]]` markers but keep the inner text.
 * Used by admin panel and customer apps.
 *
 * "حلوى [[تجربة]] كبيرة" → "حلوى تجربة كبيرة"
 */
export function stripDesignMarkers(text: string | undefined | null): string {
  if (!text) return '';
  // Replace [[...]] with just the inner content
  return text.replace(/\[\[([^\]]*)\]\]/g, '$1').trim();
}
