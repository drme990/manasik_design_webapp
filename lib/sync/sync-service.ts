import type { SyncResult, SyncOperation, SyncableDocument } from '@/types';
import { SyncQueue } from './sync-queue';
import { ConflictResolver } from './conflict-resolver';
import { NetworkMonitor } from './network-monitor';
import { kvStorage } from '../utils/kv-storage';

const SYNC_QUEUE_KEY = 'manasik:sync-queue';
const SYNC_STATE_KEY = 'manasik:sync-state';

export class SyncService {
  private queue: SyncQueue;
  private conflictResolver: ConflictResolver;
  private networkMonitor: NetworkMonitor;
  private isSyncing: boolean = false;
  private syncInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.queue = new SyncQueue();
    this.conflictResolver = new ConflictResolver();
    this.networkMonitor = new NetworkMonitor();
  }

  async initialize(): Promise<void> {
    this.networkMonitor.startMonitoring();

    // Auto-sync when connection is restored
    this.networkMonitor.onStatusChange(async (isOnline) => {
      if (isOnline && !this.isSyncing) {
        await this.sync();
      }
    });

    // Periodic sync
    this.syncInterval = setInterval(async () => {
      if (this.networkMonitor.isOnline() && !this.isSyncing) {
        await this.sync();
      }
    }, 30000); // Sync every 30 seconds
  }

  async sync(): Promise<SyncResult> {
    if (this.isSyncing) {
      return { success: false, synced: 0, failed: 0, conflicts: 0, errors: [], duration: 0 };
    }

    if (!this.networkMonitor.isOnline()) {
      console.log('Offline - skipping sync');
      return { success: false, synced: 0, failed: 0, conflicts: 0, errors: [], duration: 0 };
    }

    this.isSyncing = true;
    const startTime = Date.now();

    try {
      await this.updateSyncState({ isSyncing: true });

      // Process queued operations
      const result = await this.queue.process();

      // Sync each collection
      const collections = ['projects', 'booking_products', 'exports', 'pdf_projects'];
      let totalSynced = 0;
      let totalFailed = 0;
      const errors: Array<{ documentId: string; error: string }> = [];

      for (const collection of collections) {
        try {
          const synced = await this.syncCollection(collection);
          totalSynced += synced.synced;
          totalFailed += synced.failed;
          errors.push(...synced.errors);
        } catch (error) {
          totalFailed++;
          errors.push({
            documentId: collection,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      const duration = Date.now() - startTime;
      const syncResult: SyncResult = {
        success: totalFailed === 0,
        synced: totalSynced + result.synced,
        failed: totalFailed + result.failed,
        conflicts: result.conflicts,
        errors,
        duration
      };

      await this.updateSyncState({
        isSyncing: false,
        lastSyncAt: Date.now(),
        lastError: totalFailed > 0 ? 'Some sync operations failed' : undefined
      });

      return syncResult;
    } catch (error) {
      const duration = Date.now() - startTime;
      await this.updateSyncState({
        isSyncing: false,
        lastError: error instanceof Error ? error.message : 'Sync failed'
      });

      return {
        success: false,
        synced: 0,
        failed: 1,
        conflicts: 0,
        errors: [{
          documentId: 'system',
          error: error instanceof Error ? error.message : 'Unknown error'
        }],
        duration
      };
    } finally {
      this.isSyncing = false;
    }
  }

  async syncCollection(collection: string): Promise<SyncResult> {
    // This would sync a specific collection with MongoDB
    // For now, return a placeholder result
    return {
      success: true,
      synced: 0,
      failed: 0,
      conflicts: 0,
      errors: [],
      duration: 0
    };
  }

  async syncDocument(collection: string, id: string): Promise<void> {
    // Sync a specific document
    const key = `manasik:${collection}`;
    const documents = await kvStorage.getItem<SyncableDocument[]>(key);

    if (!documents) return;

    const document = documents.find((doc: SyncableDocument) => doc.id === id);
    if (!document) return;

    // Queue the document for sync
    await this.queue.add({
      type: 'update',
      collection,
      documentId: id,
      data: document
    });
  }

  async queueOperation(operation: Omit<SyncOperation, 'id' | 'timestamp' | 'retryCount' | 'status'>): Promise<void> {
    await this.queue.add({
      type: operation.type,
      collection: operation.collection,
      documentId: operation.documentId,
      data: operation.data
    });
  }

  private async handleConflict(document: SyncableDocument): Promise<void> {
    await this.conflictResolver.resolve({
      documentId: document.id || '',
      localVersion: document,
      remoteVersion: document, // Would be fetched from MongoDB
      delta: {},
      conflict: true
    });
  }

  private async applyRemoteChanges(document: SyncableDocument): Promise<void> {
    // Apply remote changes to local storage
    const collection = this.getCollectionFromDocument(document);
    const key = `manasik:${collection}`;

    const documents = await kvStorage.getItem<SyncableDocument[]>(key) || [];
    const index = documents.findIndex((doc: SyncableDocument) => doc.id === document.id);

    if (index >= 0) {
      documents[index] = {
        ...document,
        syncStatus: 'synced' as const,
        syncedAt: Date.now()
      };
    } else {
      documents.push({
        ...document,
        syncStatus: 'synced' as const,
        syncedAt: Date.now()
      });
    }

    await kvStorage.setItem(key, documents);
  }

  private async queueLocalChanges(document: SyncableDocument): Promise<void> {
    const collection = this.getCollectionFromDocument(document);
    await this.queueOperation({
      type: document._id ? 'update' : 'create',
      collection,
      documentId: document.id,
      data: document
    });
  }

  private getCollectionFromDocument(document: SyncableDocument): string {
    const doc = document as Record<string, unknown>;
    if (doc.kind === 'booking_template' || doc.kind === 'design') {
      return 'projects';
    }
    if (doc.templates) {
      return 'booking_products';
    }
    if (doc.images && !doc.type) {
      return 'pdf_projects';
    }
    if (doc.type === 'png' || doc.type === 'pdf') {
      return 'exports';
    }
    return 'unknown';
  }

  private async updateSyncState(updates: Partial<{
    lastSyncAt: number | null;
    isOnline: boolean;
    isSyncing: boolean;
    pendingOperations: number;
    conflicts: number;
    lastError: string | undefined;
  }>): Promise<void> {
    const currentState = await kvStorage.getItem<any>(SYNC_STATE_KEY) || {
      lastSyncAt: null,
      isOnline: this.networkMonitor.isOnline(),
      isSyncing: false,
      pendingOperations: 0,
      conflicts: 0,
      lastError: undefined
    };

    const newState = {
      ...currentState,
      ...updates,
      pendingOperations: updates.pendingOperations !== undefined ? updates.pendingOperations : await this.queue.getPendingCount()
    };

    await kvStorage.setItem(SYNC_STATE_KEY, newState);
  }

  async getSyncState() {
    return await kvStorage.getItem(SYNC_STATE_KEY);
  }

  async destroy(): Promise<void> {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }
    this.networkMonitor.stopMonitoring();
  }
}