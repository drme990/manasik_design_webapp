import type { BookingProduct, BookingProductCreateInput, BookingProductUpdateInput, Project } from '@/types';
import { fetchWithAuth } from './fetch-with-auth';
import { createResourceCache } from './cache';
import { createProject, getProject } from './projects';

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

export async function getOrCreateTemplateProject(
  productId: string,
  model: 'withImage' | 'withoutImage',
  variant: 'single' | 'double' | 'multiple'
): Promise<Project> {
  const product = await getBookingProduct(productId);
  if (!product) {
    throw new Error('Product not found');
  }

  const templateId = product.templates[model][variant];

  if (templateId) {
    const project = await getProject(templateId);
    if (project) {
      return project;
    }
  }

  const projectName = `${product.name} — ${model === 'withImage' ? 'بصورة' : 'بدون صورة'} — ${getVariantLabel(variant)}`;

  const project = await createProject({
    name: projectName,
    kind: 'booking_template',
    canvasWidth: product.defaultCanvas.width,
    canvasHeight: product.defaultCanvas.height,
    backgroundUri: product.defaultCanvas.backgroundUri,
    bookingMeta: {
      productId,
      model,
      variant,
    },
  });

  const updatedTemplates = {
    ...product.templates,
    [model]: {
      ...product.templates[model],
      [variant]: project.id,
    },
  };

  await updateBookingProduct(productId, { templates: updatedTemplates });

  return project;
}

function getVariantLabel(variant: 'single' | 'double' | 'multiple'): string {
  const labels = {
    single: 'قطعة واحدة',
    double: 'قطعتين',
    multiple: 'أكثر من قطعتين',
  };
  return labels[variant];
}

export async function seedDefaultProducts(): Promise<void> {
  try {
    await fetchWithAuth('/api/booking-products/seed', { method: 'POST' });
  } catch (error) {
    console.warn('Failed to seed booking products via API:', error);
  }
}
