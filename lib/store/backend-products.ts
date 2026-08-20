import { fetchWithAuth } from './fetch-with-auth';
import { createResourceCache } from './cache';

/**
 * Backend product store — fetches real products from the backend's
 * MongoDB `products` collection via the design app's proxy route
 * (/api/backend/products). Same API-first pattern as other stores.
 */

/**
 * Special placeholder product ID for manual orders.
 *
 * When the admin creates a manual order with a custom product name
 * (instead of picking an existing product), the order item's
 * `productId` is set to this value. The design app has a matching
 * "Manual Order" booking product that the admin can connect to any
 * template — just like a real product.
 *
 * This constant must match the one in the backend's
 * `lib/constants/manual-order.ts`.
 */
export const MANUAL_ORDER_PRODUCT_ID = '__manual_order__';

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

/**
 * The "Manual Order" pseudo-product — injected into the backend products
 * list so the admin can connect it to templates in the ConnectProductsModal,
 * just like a real product. It has a single size (index 0).
 */
const MANUAL_ORDER_PRODUCT: BackendProduct = {
  id: MANUAL_ORDER_PRODUCT_ID,
  name: 'Manual Order',
  slug: 'manual-order',
  isActive: true,
  sizes: [{ index: 0, name: 'Default' }],
};

export async function listBackendProducts(): Promise<BackendProduct[]> {
  const cached = cache.getList();
  if (cached) return cached;

  const result = await fetchWithAuth('/api/backend/products');
  const products = (result.data || []) as BackendProduct[];
  // Inject the "Manual Order" pseudo-product at the top so the admin
  // can connect it to templates. This product doesn't exist in the
  // backend's `products` collection — it's a design-app-only placeholder
  // for manual orders with custom product names.
  const withManual = [MANUAL_ORDER_PRODUCT, ...products];
  cache.setList(withManual);
  return withManual;
}

export function invalidateBackendProductsCache(): void {
  cache.invalidateList();
}
