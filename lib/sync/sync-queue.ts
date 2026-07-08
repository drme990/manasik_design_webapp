import type { SyncOperation, SyncResult } from '@/types';
import { kvStorage } from '../utils/kv-storage';

const SYNC_QUEUE_KEY = 'manasik:sync-queue';
const MAX_RETRIES = 3;
const RETRY_DELAY = 5000; // 5 seconds

export class SyncQueue {
  async add(operation: Omit<SyncOperation, 'id' | 'timestamp' | 'retryCount' | 'status'>): Promise<void> {
    const queue = await this.getQueue();

    const newOperation: SyncOperation = {
      ...operation,
      id: `op-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      retryCount: 0,
      status: 'pending'
    };

    queue.push(newOperation);
    await this.saveQueue(queue);
  }

  async process(): Promise<SyncResult> {
    const queue = await this.getQueue();
    const pending = queue.filter(op => op.status === 'pending');

    let synced = 0;
    let failed = 0;
    const conflicts = 0;
    const errors: Array<{ documentId: string; error: string }> = [];

    for (const operation of pending) {
      try {
        await this.processOperation(operation);
        synced++;
      } catch (error) {
        failed++;
        errors.push({
          documentId: operation.documentId,
          error: error instanceof Error ? error.message : 'Unknown error'
        });

        // Update operation status
        await this.updateOperationStatus(operation.id, 'failed', error instanceof Error ? error.message : undefined);
      }
    }

    // Clean up completed operations
    await this.cleanupCompleted();

    return {
      success: failed === 0,
      synced,
      failed,
      conflicts,
      errors,
      duration: 0
    };
  }

  async retryFailed(): Promise<void> {
    const queue = await this.getQueue();
    const failed = queue.filter(op => op.status === 'failed' && this.shouldRetry(op));

    for (const operation of failed) {
      operation.retryCount++;
      operation.status = 'pending';
      operation.nextRetryAt = Date.now() + RETRY_DELAY * Math.pow(2, operation.retryCount);
    }

    await this.saveQueue(queue);
  }

  async clear(): Promise<void> {
    await kvStorage.setItem(SYNC_QUEUE_KEY, []);
  }

  async getPendingCount(): Promise<number> {
    const queue = await this.getQueue();
    return queue.filter(op => op.status === 'pending').length;
  }

  private async getQueue(): Promise<SyncOperation[]> {
    return await kvStorage.getItem<SyncOperation[]>(SYNC_QUEUE_KEY) || [];
  }

  private async saveQueue(queue: SyncOperation[]): Promise<void> {
    await kvStorage.setItem(SYNC_QUEUE_KEY, queue);
  }

  private async processOperation(operation: SyncOperation): Promise<void> {
    // Update status to processing
    await this.updateOperationStatus(operation.id, 'processing');

    // This would actually communicate with MongoDB
    // For now, we'll simulate the operation
    await this.simulateOperation(operation);

    // Mark as completed
    await this.updateOperationStatus(operation.id, 'completed');
  }

  private async simulateOperation(operation: SyncOperation): Promise<void> {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 100));

    // Simulate occasional failures (10% chance)
    if (Math.random() < 0.1) {
      throw new Error('Simulated network error');
    }
  }

  private async updateOperationStatus(
    id: string,
    status: 'pending' | 'processing' | 'completed' | 'failed',
    error?: string
  ): Promise<void> {
    const queue = await this.getQueue();
    const operation = queue.find(op => op.id === id);

    if (operation) {
      operation.status = status;
      if (error) {
        operation.error = error;
      }
      await this.saveQueue(queue);
    }
  }

  private async cleanupCompleted(): Promise<void> {
    const queue = await this.getQueue();
    const active = queue.filter(op => op.status !== 'completed');
    await this.saveQueue(active);
  }

  private shouldRetry(operation: SyncOperation): boolean {
    return operation.retryCount < MAX_RETRIES;
  }
}