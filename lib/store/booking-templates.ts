import type { BookingProduct, BookingProductCreateInput, BookingProductUpdateInput, TemplateKey, Project } from '@/types';
import { kvStorage } from '@/lib/utils/kv-storage';
import { generateId } from '@/lib/utils/id';
import { createProject, getProject, saveProject } from './projects';

const STORAGE_KEY = 'manasik:booking_products';

export async function listBookingProducts(): Promise<BookingProduct[]> {
  try {
    const data = await kvStorage.getItem<BookingProduct[]>(STORAGE_KEY);
    return data || [];
  } catch (error) {
    console.error('Failed to list booking products:', error);
    return [];
  }
}

export async function getBookingProduct(id: string): Promise<BookingProduct | null> {
  try {
    const products = await listBookingProducts();
    return products.find(p => p.id === id) || null;
  } catch (error) {
    console.error('Failed to get booking product:', error);
    return null;
  }
}

export async function createBookingProduct(input: BookingProductCreateInput): Promise<BookingProduct> {
  const product: BookingProduct = {
    id: generateId(),
    name: input.name,
    imageUri: input.imageUri,
    defaultCanvas: input.defaultCanvas,
    templates: {
      withImage: { single: null, double: null, multiple: null },
      withoutImage: { single: null, double: null, multiple: null }
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
    localModifiedAt: Date.now(),
    syncStatus: 'pending',
    userId: input.userId
  };

  await saveBookingProduct(product);
  return product;
}

export async function saveBookingProduct(product: BookingProduct): Promise<void> {
  try {
    const products = await listBookingProducts();
    const index = products.findIndex(p => p.id === product.id);

    const updatedProduct = {
      ...product,
      updatedAt: Date.now(),
      localModifiedAt: Date.now(),
      syncStatus: 'pending' as const
    };

    if (index >= 0) {
      products[index] = updatedProduct;
    } else {
      products.push(updatedProduct);
    }

    await kvStorage.setItem(STORAGE_KEY, products);
  } catch (error) {
    console.error('Failed to save booking product:', error);
    throw error;
  }
}

export async function updateBookingProduct(id: string, updates: BookingProductUpdateInput): Promise<BookingProduct | null> {
  const product = await getBookingProduct(id);
  if (!product) return null;

  const updated = {
    ...product,
    ...updates,
    id, // Ensure ID doesn't change
    localModifiedAt: Date.now(),
    syncStatus: 'pending' as const
  };

  await saveBookingProduct(updated);
  return updated;
}

export async function deleteBookingProduct(id: string): Promise<void> {
  try {
    const products = await listBookingProducts();
    const filtered = products.filter(p => p.id !== id);
    await kvStorage.setItem(STORAGE_KEY, filtered);
  } catch (error) {
    console.error('Failed to delete booking product:', error);
    throw error;
  }
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

  // Create new template project
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
      variant
    }
  });

  // Update product with new template ID
  const updatedTemplates = {
    ...product.templates,
    [model]: {
      ...product.templates[model],
      [variant]: project.id
    }
  };

  await updateBookingProduct(productId, { templates: updatedTemplates });

  return project;
}

function getVariantLabel(variant: 'single' | 'double' | 'multiple'): string {
  const labels = {
    single: 'قطعة واحدة',
    double: 'قطعتين',
    multiple: 'أكثر من قطعتين'
  };
  return labels[variant];
}

// Pre-seed default products
export async function seedDefaultProducts(): Promise<void> {
  const existing = await listBookingProducts();
  if (existing.length > 0) return;

  const defaultProducts = [
    {
      name: 'خروف عقيقة بالطعام',
      defaultCanvas: { width: 1080, height: 1080 }
    },
    {
      name: 'خروف كبير عقيقة بالطعام',
      defaultCanvas: { width: 1080, height: 1080 }
    },
    {
      name: 'كبش عقيقة بالطعام',
      defaultCanvas: { width: 1080, height: 1080 }
    }
  ];

  for (const productData of defaultProducts) {
    await createBookingProduct(productData);
  }
}