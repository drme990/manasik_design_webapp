import type { SyncableDocument } from './storage';

export interface SyncConfig {
  enabled: boolean;
  syncInterval: number; // milliseconds
  retryInterval: number; // milliseconds
  maxRetries: number;
  conflictResolution: 'local' | 'remote' | 'manual';
}

export interface SyncMetrics {
  totalSyncs: number;
  successfulSyncs: number;
  failedSyncs: number;
  lastSyncDuration: number;
  averageSyncDuration: number;
  documentsSynced: number;
  conflictsResolved: number;
}

export interface SyncQueueItem {
  id: string;
  operation: 'create' | 'update' | 'delete';
  collection: string;
  documentId: string;
  data: SyncableDocument;
  timestamp: number;
  retryCount: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error?: string;
  nextRetryAt?: number;
}

export interface SyncResult {
  success: boolean;
  synced: number;
  failed: number;
  conflicts: number;
  errors: Array<{
    documentId: string;
    error: string;
  }>;
  duration: number;
}

export interface DocumentDelta {
  documentId: string;
  localVersion: SyncableDocument;
  remoteVersion: SyncableDocument;
  delta: Record<string, unknown>;
  conflict: boolean;
}