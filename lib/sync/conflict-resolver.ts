import type { DocumentDelta, ConflictResolution, SyncableDocument, SyncStatus } from '@/types';

interface DocumentWithTimestamps {
  id: string;
  localModifiedAt?: number;
  updatedAt: number;
  syncStatus: SyncStatus;
  layers?: Array<{ id: string }>;
  canvasWidth?: number;
  canvasHeight?: number;
  kind?: string;
  [key: string]: unknown;
}

export class ConflictResolver {
  async resolve(conflict: DocumentDelta): Promise<SyncableDocument> {
    const { localVersion, remoteVersion } = conflict;

    // Check if auto-resolution is possible
    if (!this.requiresManualResolution(localVersion, remoteVersion)) {
      return this.autoResolve(localVersion, remoteVersion);
    }

    // For now, default to local version
    // In a real implementation, this would trigger a UI dialog
    return this.autoResolve(localVersion, remoteVersion);
  }

  private autoResolve(local: SyncableDocument, remote: SyncableDocument): SyncableDocument {
    // Last-write-wins based on timestamps
    const localTime = (local as unknown as DocumentWithTimestamps).localModifiedAt || (local as unknown as DocumentWithTimestamps).updatedAt || 0;
    const remoteTime = (remote as unknown as DocumentWithTimestamps).updatedAt || 0;

    if (localTime > remoteTime) {
      return local;
    }

    return remote;
  }

  private mergeChanges(local: DocumentWithTimestamps, remote: DocumentWithTimestamps): DocumentWithTimestamps {
    // Smart merge for compatible changes
    const merged: DocumentWithTimestamps = { ...local };

    // Merge arrays (layers, etc.)
    if (local.layers && remote.layers) {
      merged.layers = this.mergeArrays(local.layers, remote.layers);
    }

    // Merge objects
    for (const key in remote) {
      if (local[key as keyof DocumentWithTimestamps] === undefined) {
        merged[key as keyof DocumentWithTimestamps] = remote[key as keyof DocumentWithTimestamps];
      }
    }

    return merged;
  }

  private mergeArrays(local: Array<{ id: string }>, remote: Array<{ id: string }>): Array<{ id: string }> {
    // Merge arrays by ID
    const merged = [...local];
    const localIds = new Set(local.map(item => item.id));

    for (const remoteItem of remote) {
      if (!localIds.has(remoteItem.id)) {
        merged.push(remoteItem);
      } else {
        // Update existing item
        const index = merged.findIndex(item => item.id === remoteItem.id);
        if (index >= 0) {
          merged[index] = this.mergeChanges(merged[index] as DocumentWithTimestamps, remoteItem as DocumentWithTimestamps) as { id: string };
        }
      }
    }

    return merged;
  }

  private requiresManualResolution(local: SyncableDocument, remote: SyncableDocument): boolean {
    // Check if there are conflicting changes to the same fields
    const localModified = this.getModifiedFields(local);
    const remoteModified = this.getModifiedFields(remote);

    const conflicts = localModified.filter(field => remoteModified.includes(field));

    // If there are conflicts in critical fields, require manual resolution
    const criticalFields = ['layers', 'canvasWidth', 'canvasHeight', 'kind'];
    return conflicts.some(field => criticalFields.includes(field));
  }

  private getModifiedFields(obj: SyncableDocument): string[] {
    if (!obj) return [];

    // This is a simplified version
    // In a real implementation, you'd track which fields were modified
    return Object.keys(obj);
  }

  async createConflictResolution(
    documentId: string,
    localVersion: SyncableDocument,
    remoteVersion: SyncableDocument,
    resolution: 'local' | 'remote' | 'merge'
  ): Promise<ConflictResolution> {
    const resolved: SyncableDocument =
      resolution === 'local' ? localVersion :
        resolution === 'remote' ? remoteVersion :
          this.mergeChanges(localVersion as unknown as DocumentWithTimestamps, remoteVersion as unknown as DocumentWithTimestamps) as SyncableDocument;

    return {
      documentId,
      localVersion,
      remoteVersion,
      resolution,
      resolvedAt: Date.now()
    };
  }
}