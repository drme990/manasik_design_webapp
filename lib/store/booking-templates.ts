import type { BookingProduct, BookingProductCreateInput, BookingProductUpdateInput, Project } from '@/types';
import { fetchWithAuth } from './fetch-with-auth';
import { getQueryClient, queryKeys } from '@/lib/query/client';
import { getProject, createProject } from '@/lib/query/projects';
import type { BackendProduct } from './backend-products';

/**
 * Booking product store — API-first architecture. Booking products live
 * in MongoDB (via /api/booking-products). No IndexedDB, no localStorage
 * mirror — the database is the single source of truth.
 *
 * Caching is handled by the shared TanStack Query client (lib/query):
 * `fetchQuery` dedupes in-flight calls and serves cached data within
 * `staleTime` (refetching when stale); mutations update the item entries
 * and invalidate the list.
 */

export async function fetchBookingProducts(): Promise<BookingProduct[]> {
  const result = await fetchWithAuth('/api/booking-products');
  return (result.data || []) as BookingProduct[];
}

/** Invalidate the list cache — e.g. after server-side slot changes that
 *  bypass these store functions (template duplication with
 *  copyProductConnections). */
export function invalidateBookingProductsList(): void {
  void getQueryClient().invalidateQueries({ queryKey: queryKeys.bookingProductsList });
}

export async function listBookingProducts(): Promise<BookingProduct[]> {
  return getQueryClient().fetchQuery({
    queryKey: queryKeys.bookingProductsList,
    queryFn: fetchBookingProducts,
  });
}

export async function getBookingProduct(id: string): Promise<BookingProduct | null> {
  const qc = getQueryClient();
  try {
    return await qc.fetchQuery({
      queryKey: queryKeys.bookingProduct(id),
      queryFn: async () => {
        const result = await fetchWithAuth(`/api/booking-products/${id}`);
        return result.data as BookingProduct;
      },
    });
  } catch (error) {
    console.warn('Failed to fetch booking product from API:', error);
    // Last-resort: cached item even if stale
    return qc.getQueryData(queryKeys.bookingProduct(id)) ?? null;
  }
}

export async function createBookingProduct(input: BookingProductCreateInput): Promise<BookingProduct> {
  const result = await fetchWithAuth('/api/booking-products', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  const product = result.data as BookingProduct;
  const qc = getQueryClient();
  qc.setQueryData(queryKeys.bookingProduct(product.id), product);
  await qc.invalidateQueries({ queryKey: queryKeys.bookingProductsList });
  return product;
}

export async function updateBookingProduct(id: string, updates: BookingProductUpdateInput): Promise<BookingProduct | null> {
  const result = await fetchWithAuth(`/api/booking-products/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
  const updated = result.data as BookingProduct;
  const qc = getQueryClient();
  qc.setQueryData(queryKeys.bookingProduct(id), updated);
  await qc.invalidateQueries({ queryKey: queryKeys.bookingProductsList });
  return updated;
}

/**
 * Bulk update — applies many template-slot changes in a single request.
 * Each change either updates an existing booking product (by ID) or
 * creates a new one (by backendProductId) and sets the slot value.
 */
export interface BulkChangeInput {
  bookingProductId?: string;
  backendProductId?: string;
  /** Size index — 0 for default. Required when creating new booking products. */
  sizeIndex?: number;
  /** Size name (Arabic, for display). */
  sizeName?: string;
  backendSlug?: string;
  name?: string;
  imageUri?: string;
  value: string | null;
}

export async function bulkUpdateBookingProducts(
  slotKey: 'templateId' | 'imageTemplateId' | 'ghadaqTemplateId' | 'ghadaqImageTemplateId',
  changes: BulkChangeInput[],
): Promise<BookingProduct[]> {
  const result = await fetchWithAuth('/api/booking-products', {
    method: 'PATCH',
    body: JSON.stringify({ slotKey, changes }),
  });
  const products = (result.data || []) as BookingProduct[];
  const qc = getQueryClient();
  for (const p of products) qc.setQueryData(queryKeys.bookingProduct(p.id), p);
  await qc.invalidateQueries({ queryKey: queryKeys.bookingProductsList });
  return products;
}

export async function deleteBookingProduct(id: string): Promise<void> {
  await fetchWithAuth(`/api/booking-products/${id}`, { method: 'DELETE' });
  const qc = getQueryClient();
  qc.removeQueries({ queryKey: queryKeys.bookingProduct(id) });
  await qc.invalidateQueries({ queryKey: queryKeys.bookingProductsList });
}

/**
 * Find an existing booking product linked to a backend product, or
 * create one if it doesn't exist yet. The booking product acts as the
 * bridge between the backend product and a template project.
 */
export async function getOrCreateBookingProduct(
  backendProduct: BackendProduct,
  sizeIndex = 0,
  sizeName?: string,
  defaultCanvas = { width: 1080, height: 1080 },
): Promise<BookingProduct> {
  // Check if a booking product already exists for this (product, size) pair
  const all = await listBookingProducts();
  const existing = all.find(
    (bp) => bp.backendProductId === backendProduct.id && (bp.sizeIndex ?? 0) === sizeIndex,
  );
  if (existing) return existing;

  // Create a new booking product linked to the backend product + size
  return createBookingProduct({
    backendProductId: backendProduct.id,
    sizeIndex,
    sizeName,
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
  appSource: 'manasik' | 'ghadaq' = 'manasik',
): Promise<Project> {
  const product = await getBookingProduct(productId);
  if (!product) {
    throw new Error('Product not found');
  }

  // Compute the existing template ID from the right slot
  const existingId =
    appSource === 'ghadaq'
      ? (templateType === 'image' ? product.ghadaqImageTemplateId : product.ghadaqTemplateId)
      : (templateType === 'image' ? product.imageTemplateId : product.templateId);

  if (existingId) {
    const project = await getProject(existingId);
    if (project) {
      return project;
    }
  }

  const variantLabel = templateType === 'image' ? 'قالب صور' : 'قالب';
  const appLabel = appSource === 'ghadaq' ? 'غدق' : 'مناسك';
  const projectName = `${product.name} — ${variantLabel} (${appLabel})`;

  const project = await createProject({
    name: projectName,
    kind: 'booking_template',
    canvasWidth: product.defaultCanvas.width,
    canvasHeight: product.defaultCanvas.height,
    backgroundUri: product.defaultCanvas.backgroundUri,
    bookingMeta: {
      productId,
    },
    templateType,
    appSource,
  });

  // Link the new template to the right slot on the booking product
  if (appSource === 'ghadaq') {
    if (templateType === 'image') {
      await updateBookingProduct(productId, { ghadaqImageTemplateId: project.id });
    } else {
      await updateBookingProduct(productId, { ghadaqTemplateId: project.id });
    }
  } else {
    if (templateType === 'image') {
      await updateBookingProduct(productId, { imageTemplateId: project.id });
    } else {
      await updateBookingProduct(productId, { templateId: project.id });
    }
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
