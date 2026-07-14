import type { BookingProduct, BookingProductCreateInput, BookingProductUpdateInput, TemplateKey, Project } from '@/types';
import { kvStorage } from '@/lib/utils/kv-storage';
import { generateId } from '@/lib/utils/id';
import { createProject, getProject, saveProject } from './projects';

const STORAGE_KEY = 'manasik:booking_products';

async function fetchWithAuth(url: string, options: RequestInit = {}) {
  const response = await fetch(url, {
    ...options,
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'unknown' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

async function mergeLocalProduct(product: BookingProduct): Promise<void> {
  const products = await kvStorage.getItem<BookingProduct[]>(STORAGE_KEY) || [];
  const index = products.findIndex((p) => p.id === product.id);
  if (index >= 0) {
    products[index] = product;
  } else {
    products.push(product);
  }
  await kvStorage.setItem(STORAGE_KEY, products);
}

export async function listBookingProducts(): Promise<BookingProduct[]> {
  try {
    const result = await fetchWithAuth('/api/booking-products');
    const products = (result.data || []) as BookingProduct[];
    await kvStorage.setItem(STORAGE_KEY, products);
    return products;
  } catch (error) {
    console.warn('Failed to fetch booking products from API, falling back to local cache:', error);
    const data = await kvStorage.getItem<BookingProduct[]>(STORAGE_KEY);
    return data || [];
  }
}

export async function getBookingProduct(id: string): Promise<BookingProduct | null> {
  try {
    const result = await fetchWithAuth(`/api/booking-products/${id}`);
    const product = result.data as BookingProduct;
    await mergeLocalProduct(product);
    return product;
  } catch (error) {
    console.warn('Failed to fetch booking product from API, falling back to local cache:', error);
    const products = await listBookingProducts();
    return products.find((p) => p.id === id) || null;
  }
}

export async function createBookingProduct(input: BookingProductCreateInput): Promise<BookingProduct> {
  try {
    const result = await fetchWithAuth('/api/booking-products', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    const product = result.data as BookingProduct;
    await mergeLocalProduct(product);
    return product;
  } catch (error) {
    console.warn('Failed to create booking product on API, creating locally only:', error);
    const product: BookingProduct = {
      id: generateId(),
      name: input.name,
      imageUri: input.imageUri,
      defaultCanvas: input.defaultCanvas,
      templates: {
        withImage: { single: null, double: null, multiple: null },
        withoutImage: { single: null, double: null, multiple: null },
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
      localModifiedAt: Date.now(),
      syncStatus: 'pending',
      userId: input.userId,
    };
    await mergeLocalProduct(product);
    return product;
  }
}

export async function saveBookingProduct(product: BookingProduct): Promise<void> {
  try {
    await fetchWithAuth(`/api/booking-products/${product.id}`, {
      method: 'PATCH',
      body: JSON.stringify(product),
    });
  } catch (error) {
    console.warn('Failed to save booking product to API, saving locally only:', error);
  }

  await mergeLocalProduct({
    ...product,
    updatedAt: Date.now(),
    localModifiedAt: Date.now(),
    syncStatus: 'pending',
  });
}

export async function updateBookingProduct(id: string, updates: BookingProductUpdateInput): Promise<BookingProduct | null> {
  const product = await getBookingProduct(id);
  if (!product) return null;

  const updated = {
    ...product,
    ...updates,
    id,
    localModifiedAt: Date.now(),
    syncStatus: 'pending' as const,
  };

  await saveBookingProduct(updated);
  return updated;
}

export async function deleteBookingProduct(id: string): Promise<void> {
  try {
    await fetchWithAuth(`/api/booking-products/${id}`, {
      method: 'DELETE',
    });
  } catch (error) {
    console.warn('Failed to delete booking product from API, deleting locally only:', error);
  }

  const products = await kvStorage.getItem<BookingProduct[]>(STORAGE_KEY) || [];
  const filtered = products.filter((p) => p.id !== id);
  await kvStorage.setItem(STORAGE_KEY, filtered);
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
