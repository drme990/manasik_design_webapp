import type { SyncableDocument } from './storage';

export type ExportType = 'png' | 'pdf';

export interface ExportedItem extends SyncableDocument {
  id: string;
  _id?: string;
  projectId?: string;
  uri: string;
  type: ExportType;
  createdAt: number;
  localModifiedAt: number;
  syncStatus: 'synced' | 'pending' | 'conflict' | 'error';
  syncedAt?: number;
  userId?: string;
}

export interface PdfImage {
  id: string;
  uri: string;
  /** Smaller version for galleries/lists — falls back to uri if not generated */
  thumbnailUri?: string;
  naturalWidth: number;
  naturalHeight: number;
}

export interface PdfProject extends SyncableDocument {
  id: string;
  _id?: string;
  name: string;
  images: PdfImage[];
  pdfUri?: string;
  createdAt: number;
  updatedAt: number;
  localModifiedAt: number;
  syncStatus: 'synced' | 'pending' | 'conflict' | 'error';
  syncedAt?: number;
  userId?: string;
}

export interface PdfProjectCreateInput {
  name: string;
  images: PdfImage[];
  userId?: string;
}

export interface PdfProjectUpdateInput {
  name?: string;
  images?: PdfImage[];
  pdfUri?: string;
  updatedAt?: number;
  localModifiedAt?: number;
}

export interface RecentColor {
  hex: string;
  timestamp: number;
}

export interface PresetSize {
  name: string;
  width: number;
  height: number;
  category: 'square' | 'story' | 'post' | 'custom';
}

export interface AspectRatio {
  label: string;
  ratio: number;
  width: number;
  height: number;
}