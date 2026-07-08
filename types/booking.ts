import type { CanvasSize, BookingModel, BookingVariant } from './project';
import type { SyncableDocument } from './storage';

export interface TemplateMap {
  single: string | null;
  double: string | null;
  multiple: string | null;
}

export interface Templates {
  withImage: TemplateMap;
  withoutImage: TemplateMap;
}

export interface BookingProduct extends SyncableDocument {
  id: string;
  _id?: string; // MongoDB ObjectId
  name: string;
  imageUri?: string;
  createdAt: number;
  updatedAt: number;
  localModifiedAt: number;
  syncStatus: 'synced' | 'pending' | 'conflict' | 'error';
  syncedAt?: number;
  defaultCanvas: CanvasSize;
  templates: Templates;
  userId?: string;
}

export interface BookingProductCreateInput {
  name: string;
  imageUri?: string;
  defaultCanvas: CanvasSize;
  userId?: string;
}

export interface BookingProductUpdateInput {
  name?: string;
  imageUri?: string;
  defaultCanvas?: CanvasSize;
  templates?: Templates;
  updatedAt?: number;
  localModifiedAt?: number;
}

export interface TemplateKey {
  model: BookingModel;
  variant: BookingVariant;
}