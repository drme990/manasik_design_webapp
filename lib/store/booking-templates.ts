import type { BookingProduct, BookingProductCreateInput, BookingProductUpdateInput, Project } from '@/types';
import { fetchWithAuth } from './fetch-with-auth';
import { createResourceCache } from './cache';
import { useProjectStore } from './use-project-store';
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
 * Get or create a template project for a booking product, for a specific
 * template variant (text or image).
 *
 * - If the booking product already has a template for the requested
 *   variant (`templateId` for 'text', `imageTemplateId` for 'image'),
 *   load that project.
 * - Otherwise, create a new booking_template project with the right
 *   `templateType`, link it to the booking product via the right slot,
 *   and return it.
 *
 * This lets the template detail page manage two independent templates
 * per product — one without image dynamic fields, one with.
 */
export async function getOrCreateTemplateProject(
  productId: string,
  templateType: 'text' | 'image' = 'text',
): Promise<Project> {
  const product = await getBookingProduct(productId);
  if (!product) {
    throw new Error('Product not found');
  }

  const existingId =
    templateType === 'image' ? product.imageTemplateId : product.templateId;

  if (existingId) {
    const project = await useProjectStore.getState().getProject(existingId);
    if (project) {
      return project;
    }
  }

  const variantLabel = templateType === 'image' ? 'قالب صور' : 'قالب';
  const projectName = `${product.name} — ${variantLabel}`;

  const project = await useProjectStore.getState().createProject({
    name: projectName,
    kind: 'booking_template',
    canvasWidth: product.defaultCanvas.width,
    canvasHeight: product.defaultCanvas.height,
    backgroundUri: product.defaultCanvas.backgroundUri,
    bookingMeta: {
      productId,
    },
    templateType,
  });

  // Link the new template to the right slot on the booking product
  if (templateType === 'image') {
    await updateBookingProduct(productId, { imageTemplateId: project.id });
  } else {
    await updateBookingProduct(productId, { templateId: project.id });
  }

  return project;
}

/**
 * Seed default products — deprecated, now a no-op. Products are loaded
 * from the backend's `products` collection directly.
 */
export async function seedDefaultProducts(): Promise<void> {
  // No-op — products come from the backend now
}
