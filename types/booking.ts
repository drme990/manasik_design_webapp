import type { CanvasSize } from './project';
import type { SyncableDocument } from './storage';

/**
 * A booking product — the design app's link between a real backend
 * product (from the `products` MongoDB collection) and a template
 * project. Each booking product has exactly one template project
 * (referenced by `templateId`).
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
  /** ID of the single template project linked to this product (null = not created yet) */
  templateId: string | null;
  userId?: string;
}

export interface BookingProductCreateInput {
  backendProductId: string;
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
  updatedAt?: number;
  localModifiedAt?: number;
}
