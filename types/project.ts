import type { AnyLayer } from './layer';
import type { SyncableDocument } from './storage';

export type ProjectKind = 'design' | 'booking_template';

/**
 * Where the project came from.
 * - 'user'   : created manually by the user in the design app (default)
 * - 'order'  : auto-generated from a booking template when an order's
 *              design was created via the admin panel callback. These
 *              designs are hidden from the main /projects list and shown
 *              in a separate /orders-designs section instead.
 */
export type ProjectSource = 'user' | 'order';

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

/**
 * Which app a booking template is designed for.
 * - 'manasik' : template for orders from the Manasik app
 * - 'ghadaq'  : template for orders from the Ghadaq app
 * Undefined = legacy template created before this field; treated as
 * 'manasik' (the original and only app when templates were introduced).
 */
export type TemplateApp = 'manasik' | 'ghadaq';

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
  /** Which app this template is for — see TemplateApp. Designs ignore this. */
  appSource?: TemplateApp;
  /** Where the project came from — 'user' (manual) or 'order' (auto-generated). */
  source?: ProjectSource;
  /**
   * R2 URL of the rendered JPG for order-generated designs (source='order').
   * Set at generation time and updated when the admin edits + saves the
   * design in the editor (the re-render endpoint overwrites the same R2 key).
   */
  orderDesignUrl?: string;
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
  appSource?: TemplateApp;
  source?: ProjectSource;
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
  appSource?: TemplateApp;
}