import type { BookingProduct, BookingProductCreateInput, BookingProductUpdateInput, Project } from '@/types';
import { fetchWithAuth } from './fetch-with-auth';
import { createResourceCache } from './cache';
import { createProject, getProject } from './projects';
import type { BackendProduct } from './backend-products';

/**
 * Booking product store — API-first architecture (same pattern as
 * lib/store/projects.ts). Booking products live in MongoDB (via
 * /api/booking-products). No IndexedDB, no localStorage mirror — the
 * database is the single source of truth. An in-memory cache avoids
 * redundant API calls when navigating between pages within the same
 * session.
 */

const CACHE_TTL_MS = 60_000; // 60 seconds
const cache = createResourceCache<BookingProduct>(CACHE_TTL_MS);

export async function listBookingProducts(): Promise<BookingProduct[]> {
  const cached = cache.getList();
  if (cached) return cached;

  const result = await fetchWithAuth('/api/booking-products');
  const products = (result.data || []) as BookingProduct[];
  cache.setList(products);
  return products;
}

export async function getBookingProduct(id: string): Promise<BookingProduct | null> {
  const cached = cache.getItem(id);
  if (cached) return cached;

  try {
    const result = await fetchWithAuth(`/api/booking-products/${id}`);
    const product = result.data as BookingProduct;
    cache.setItem(product);
    return product;
  } catch (error) {
    console.warn('Failed to fetch booking product from API:', error);
    return cache.getStaleItem(id);
  }
}

export async function createBookingProduct(input: BookingProductCreateInput): Promise<BookingProduct> {
  const result = await fetchWithAuth('/api/booking-products', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  const product = result.data as BookingProduct;
  cache.setItem(product);
  cache.invalidateList();
  return product;
}

export async function updateBookingProduct(id: string, updates: BookingProductUpdateInput): Promise<BookingProduct | null> {
  const result = await fetchWithAuth(`/api/booking-products/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
  const updated = result.data as BookingProduct;
  cache.setItem(updated);
  cache.invalidateList();
  return updated;
}

export async function deleteBookingProduct(id: string): Promise<void> {
  await fetchWithAuth(`/api/booking-products/${id}`, { method: 'DELETE' });
  cache.removeItem(id);
  cache.invalidateList();
}

/**
 * Find an existing booking product linked to a backend product, or
 * create one if it doesn't exist yet. The booking product acts as the
 * bridge between the backend product and a template project.
 */
export async function getOrCreateBookingProduct(
  backendProduct: BackendProduct,
  defaultCanvas = { width: 1080, height: 1080 },
): Promise<BookingProduct> {
  // Check if a booking product already exists for this backend product
  const all = await listBookingProducts();
  const existing = all.find((bp) => bp.backendProductId === backendProduct.id);
  if (existing) return existing;

  // Create a new booking product linked to the backend product
  return createBookingProduct({
    backendProductId: backendProduct.id,
    backendSlug: backendProduct.slug,
    name: backendProduct.name,
    imageUri: backendProduct.imageUri,
    defaultCanvas,
  });
}

/**
 * Get or create the single template project for a booking product.
 * If the booking product already has a `templateId`, load that project.
 * Otherwise, create a new booking_template project, link it to the
 * booking product via `templateId`, and return it.
 */
export async function getOrCreateTemplateProject(productId: string): Promise<Project> {
  const product = await getBookingProduct(productId);
  if (!product) {
    throw new Error('Product not found');
  }

  if (product.templateId) {
    const project = await getProject(product.templateId);
    if (project) {
      return project;
    }
  }

  const projectName = `${product.name} — قالب`;

  const project = await createProject({
    name: projectName,
    kind: 'booking_template',
    canvasWidth: product.defaultCanvas.width,
    canvasHeight: product.defaultCanvas.height,
    backgroundUri: product.defaultCanvas.backgroundUri,
    bookingMeta: {
      productId,
    },
  });

  await updateBookingProduct(productId, { templateId: project.id });

  return project;
}

/**
 * Seed default products — deprecated, now a no-op. Products are loaded
 * from the backend's `products` collection directly.
 */
export async function seedDefaultProducts(): Promise<void> {
  // No-op — products come from the backend now
}
