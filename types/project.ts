import type { AnyLayer } from './layer';
import type { SyncableDocument } from './storage';

export type ProjectKind = 'design' | 'booking_template';

/**
 * Booking template variant — only meaningful when kind='booking_template'.
 * - 'text'  : no-image template. The user cannot add image-type dynamic
 *             fields (e.g. reservation.photo). Only text dynamic fields
 *             are allowed.
 * - 'image' : image template. The user can add image-type dynamic fields
 *             (e.g. reservation.photo) that will be populated from the
 *             customer's order data at render time.
 * Undefined = legacy template created before this split; treated as
 * 'text' (the more restrictive option) for safety.
 */
export type TemplateType = 'text' | 'image';

export interface BookingMeta {
  productId: string;
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
  /**
   * Background image upload state (instant-add UX).
   * - 'uploading': file is being uploaded to R2 in the background; `backgroundUri`
   *   is a temporary object URL (blob:) so the user sees the image immediately.
   * - 'error': upload failed; user can retry.
   * - undefined: upload complete or not applicable.
   * Transient — not persisted to the DB.
   */
  bgUploadStatus?: 'uploading' | 'error';
  /** The original File for retry. Transient — not persisted. */
  bgPendingFile?: File;
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
  /** Booking template variant — see TemplateType. Designs ignore this. */
  templateType?: TemplateType;
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
  templateType?: TemplateType;
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
  templateType?: TemplateType;
}