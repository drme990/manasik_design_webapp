import type { CanvasSize } from './project';
import type { SyncableDocument } from './storage';

/**
 * A booking product — the design app's link between a real backend
 * product (from the `products` MongoDB collection) and template
 * projects. Each booking product can have up to two template projects:
 * a text template (`templateId`) and an image template
 * (`imageTemplateId`). The callback flow picks the right one based on
 * whether the order has a reservation photo.
 *
 * `backendProductId` references the backend product's `_id` (as a
 * string). This is what connects the design app's template system to
 * the real product catalog.
 */
export interface BookingProduct extends SyncableDocument {
  id: string;
  _id?: string; // MongoDB ObjectId
  /** Backend product ID (the `_id` from the `products` collection, as string) */
  backendProductId: string;
  /**
   * Size index — 0 for the default/first size, 1+ for additional sizes.
   * Together with `backendProductId`, this forms the unique key for
   * looking up the right booking product at design generation time.
   * Defaults to 0 for legacy entries (created before size-level linking).
   */
  sizeIndex: number;
  /** Size name (Arabic, for display in the UI). */
  sizeName?: string;
  /** Product slug from the backend (for readability/debugging) */
  backendSlug?: string;
  name: string;
  imageUri?: string;
  createdAt: number;
  updatedAt: number;
  localModifiedAt: number;
  syncStatus: 'synced' | 'pending' | 'conflict' | 'error';
  syncedAt?: number;
  defaultCanvas: CanvasSize;
  /**
   * ID of the text (no-image) template project linked to this product+size.
   * null = not created yet. Used for manasik orders without a reservation photo.
   */
  templateId: string | null;
  /**
   * ID of the image template project linked to this product+size.
   * null/undefined = not created yet. Used for manasik orders with a
   * reservation photo.
   */
  imageTemplateId?: string | null;
  /**
   * ID of the text template for Ghadaq orders. null/undefined = not set.
   */
  ghadaqTemplateId?: string | null;
  /**
   * ID of the image template for Ghadaq orders. null/undefined = not set.
   */
  ghadaqImageTemplateId?: string | null;
  userId?: string;
}

export interface BookingProductCreateInput {
  backendProductId: string;
  sizeIndex?: number;
  sizeName?: string;
  backendSlug?: string;
  name: string;
  imageUri?: string;
  defaultCanvas: CanvasSize;
  userId?: string;
}

export interface BookingProductUpdateInput {
  name?: string;
  imageUri?: string;
  defaultCanvas?: CanvasSize;
  templateId?: string | null;
  imageTemplateId?: string | null;
  ghadaqTemplateId?: string | null;
  ghadaqImageTemplateId?: string | null;
  updatedAt?: number;
  localModifiedAt?: number;
}
