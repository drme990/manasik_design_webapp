import { fetchWithAuth } from './fetch-with-auth';
import { createResourceCache } from './cache';

/**
 * Backend product store — fetches real products from the backend's
 * MongoDB `products` collection via the design app's proxy route
 * (/api/backend/products). Same API-first pattern as other stores.
 */

export interface BackendProductSize {
  /** 0-based size index (matches the order item's sizeIndex) */
  index: number;
  /** Arabic size name (falls back to English) */
  name: string;
}

export interface BackendProduct {
  id: string;
  name: string;
  slug: string;
  imageUri?: string;
  isActive: boolean;
  /** Product sizes — at least 1 entry. Products with 1 size are simple;
   *  products with multiple sizes can be connected to different templates
   *  per size. */
  sizes: BackendProductSize[];
}

const CACHE_TTL_MS = 60_000; // 60 seconds
const cache = createResourceCache<BackendProduct>(CACHE_TTL_MS);

export async function listBackendProducts(): Promise<BackendProduct[]> {
  const cached = cache.getList();
  if (cached) return cached;

  const result = await fetchWithAuth('/api/backend/products');
  const products = (result.data || []) as BackendProduct[];
  cache.setList(products);
  return products;
}

export function invalidateBackendProductsCache(): void {
  cache.invalidateList();
}
