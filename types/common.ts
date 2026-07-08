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

export interface PdfProject extends SyncableDocument {
  id: string;
  _id?: string;
  name: string;
  images: string[];
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
  images: string[];
  userId?: string;
}

export interface PdfProjectUpdateInput {
  name?: string;
  images?: string[];
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