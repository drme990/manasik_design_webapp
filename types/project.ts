import type { AnyLayer } from './layer';
import type { SyncableDocument } from './storage';

export type ProjectKind = 'design' | 'booking_template';

export type BookingModel = 'withImage' | 'withoutImage';
export type BookingVariant = 'single' | 'double' | 'multiple';

export interface BookingMeta {
  productId: string;
  model: BookingModel;
  variant: BookingVariant;
}

export interface CanvasSize {
  width: number;
  height: number;
  backgroundUri?: string;
}

/** Safe area — stored as percentage insets from each edge (0–50) */
export interface SafeArea {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export const DEFAULT_SAFE_AREA: SafeArea = { top: 5, right: 5, bottom: 5, left: 5 };

export interface Project extends SyncableDocument {
  id: string;
  _id?: string; // MongoDB ObjectId
  name: string;
  kind: ProjectKind;
  canvasWidth: number;
  canvasHeight: number;
  backgroundColor?: string;
  backgroundUri?: string;
  /** Smaller version of backgroundUri for galleries/lists */
  backgroundThumbnailUri?: string;
  safeArea?: SafeArea;
  layers: AnyLayer[];
  thumbnail?: string;
  createdAt: number;
  updatedAt: number;
  localModifiedAt: number;
  syncStatus: 'synced' | 'pending' | 'conflict' | 'error';
  syncedAt?: number;
  bookingMeta?: BookingMeta;
  userId?: string; // For multi-user support
}

export interface ProjectCreateInput {
  name: string;
  kind: ProjectKind;
  canvasWidth: number;
  canvasHeight: number;
  backgroundColor?: string;
  backgroundUri?: string;
  backgroundThumbnailUri?: string;
  safeArea?: SafeArea;
  layers?: AnyLayer[];
  bookingMeta?: BookingMeta;
  userId?: string;
}

export interface ProjectUpdateInput {
  name?: string;
  canvasWidth?: number;
  canvasHeight?: number;
  backgroundColor?: string;
  backgroundUri?: string;
  backgroundThumbnailUri?: string;
  safeArea?: SafeArea;
  layers?: AnyLayer[];
  thumbnail?: string;
  updatedAt?: number;
  localModifiedAt?: number;
}