/**
 * Generic in-memory cache for the app's API-first data stores.
 *
 * This is the single caching mechanism used across all client-side data
 * stores (projects, PDF projects, booking products, ...). There is no
 * IndexedDB/localStorage mirror anywhere — MongoDB (via the Next.js API
 * routes) is always the source of truth. The cache only avoids redundant
 * network requests when navigating between pages within the same browser
 * session; cached values are the exact same shape as the API/DB response
 * (no reshaping), and everything is cleared on a full page reload.
 *
 * Usage:
 *   const cache = createResourceCache<Project>(60_000);
 *   cache.setList(projects);
 *   const cached = cache.getList(); // null if missing/stale
 */
export interface ResourceCache<T extends { id: string }> {
  /** Fresh (non-stale) cached list, or null if missing/expired. */
  getList(): T[] | null;
  /** Stale cached list (may be expired) — for instant UI while refreshing. */
  getStaleList(): T[] | null;
  /** Store a freshly-fetched list and refresh the per-item cache too. */
  setList(items: T[]): void;
  /** Fresh (non-stale) cached item by id, or null if missing/expired. */
  getItem(id: string): T | null;
  /** Cached item regardless of freshness — last-resort fallback only. */
  getStaleItem(id: string): T | null;
  /** Store/update a single cached item. */
  setItem(item: T): void;
  /** Update or insert an item in the list cache (keeps list fresh). */
  upsertItemInList(item: T): void;
  /** Remove a single item from the cache. */
  removeItem(id: string): void;
  /** Invalidate just the list cache (item cache stays intact). */
  invalidateList(): void;
  /** Invalidate everything — list and all items. */
  invalidateAll(): void;
}

export function createResourceCache<T extends { id: string }>(ttlMs: number): ResourceCache<T> {
  const items = new Map<string, { value: T; cachedAt: number }>();
  let list: { values: T[]; cachedAt: number } | null = null;

  const isFresh = (cachedAt: number) => Date.now() - cachedAt < ttlMs;

  return {
    getList() {
      return list && isFresh(list.cachedAt) ? list.values : null;
    },
    getStaleList() {
      return list?.values ?? null;
    },
    setList(values) {
      list = { values, cachedAt: Date.now() };
      const now = Date.now();
      for (const value of values) {
        items.set(value.id, { value, cachedAt: now });
      }
    },
    getItem(id) {
      const entry = items.get(id);
      return entry && isFresh(entry.cachedAt) ? entry.value : null;
    },
    getStaleItem(id) {
      return items.get(id)?.value ?? null;
    },
    setItem(value) {
      items.set(value.id, { value, cachedAt: Date.now() });
    },
    upsertItemInList(item) {
      // Update the per-item cache
      items.set(item.id, { value: item, cachedAt: Date.now() });
      // Update the list cache in-place if it exists (keep it fresh)
      if (list) {
        const idx = list.values.findIndex((v) => v.id === item.id);
        if (idx >= 0) {
          list.values[idx] = item;
        } else {
          list.values.unshift(item);
        }
        list.cachedAt = Date.now(); // keep fresh
      }
    },
    removeItem(id) {
      items.delete(id);
      if (list) {
        list.values = list.values.filter((v) => v.id !== id);
      }
    },
    invalidateList() {
      list = null;
    },
    invalidateAll() {
      list = null;
      items.clear();
    },
  };
}
