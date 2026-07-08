export interface StorageKey {
  projects: 'manasik:projects';
  exports: 'manasik:exports';
  pdfProjects: 'manasik:pdf_projects';
  bookingProducts: 'manasik:booking_products';
  recentColors: 'manasik:recent-colors';
  syncQueue: 'manasik:sync-queue';
  syncState: 'manasik:sync-state';
}

export type StorageKeys = StorageKey[keyof StorageKey];

export interface StorageOptions {
  ttl?: number; // Time to live in milliseconds
}

export interface StorageResult<T> {
  data: T | null;
  error: Error | null;
}

// Sync-related types
export type SyncStatus = 'synced' | 'pending' | 'conflict' | 'error';

export interface SyncableDocument {
  id: string;
  _id?: string;
  _rev?: string; // Revision for conflict detection
  syncedAt?: number;
  localModifiedAt: number;
  syncStatus: SyncStatus;
  conflictData?: Record<string, unknown>;
  [key: string]: unknown; // Allow additional properties
}

export interface SyncOperation {
  id: string;
  type: 'create' | 'update' | 'delete';
  collection: string;
  documentId: string;
  data: any;
  timestamp: number;
  retryCount: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error?: string;
  nextRetryAt?: number;
}

export interface SyncState {
  lastSyncAt: number | null;
  isOnline: boolean;
  isSyncing: boolean;
  pendingOperations: number;
  conflicts: number;
  lastError?: string;
}

export interface ConflictResolution {
  documentId: string;
  localVersion: any;
  remoteVersion: any;
  resolution: 'local' | 'remote' | 'merge';
  resolvedAt: number;
}