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

export interface Project extends SyncableDocument {
  id: string;
  _id?: string; // MongoDB ObjectId
  name: string;
  kind: ProjectKind;
  canvasWidth: number;
  canvasHeight: number;
  backgroundUri?: string;
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
  backgroundUri?: string;
  bookingMeta?: BookingMeta;
  userId?: string;
}

export interface ProjectUpdateInput {
  name?: string;
  canvasWidth?: number;
  canvasHeight?: number;
  backgroundUri?: string;
  layers?: AnyLayer[];
  thumbnail?: string;
  updatedAt?: number;
  localModifiedAt?: number;
}