import { fetchWithAuth } from './fetch-with-auth';
import { createResourceCache } from './cache';

/**
 * Backend product store — fetches real products from the backend's
 * MongoDB `products` collection via the design app's proxy route
 * (/api/backend/products). Same API-first pattern as other stores.
 */

export interface BackendProduct {
  id: string;
  name: string;
  slug: string;
  imageUri?: string;
  isActive: boolean;
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
