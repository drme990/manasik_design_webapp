import { openDB, IDBPDatabase } from 'idb';

const DB_NAME = 'manasik-design-db';
const DB_VERSION = 1;

const STORES = [
  'projects',
  'booking_products',
  'exports',
  'pdf_projects',
  'sync_queue',
  'sync_state',
  'recent_colors'
] as const;

export class IndexedDBClient {
  private db: IDBPDatabase | null = null;

  async connect(): Promise<void> {
    if (this.db) return;

    this.db = await openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        STORES.forEach(storeName => {
          if (!db.objectStoreNames.contains(storeName)) {
            db.createObjectStore(storeName);
          }
        });
      }
    });
  }

  async get<T>(storeName: string, key: string): Promise<T | null> {
    if (!this.db) await this.connect();

    try {
      return await this.db!.get(storeName, key) || null;
    } catch (error) {
      console.error(`Failed to get ${key} from ${storeName}:`, error);
      return null;
    }
  }

  async getAll<T>(storeName: string): Promise<T[]> {
    if (!this.db) await this.connect();

    try {
      return await this.db!.getAll(storeName);
    } catch (error) {
      console.error(`Failed to get all from ${storeName}:`, error);
      return [];
    }
  }

  async set<T>(storeName: string, key: string, value: T): Promise<void> {
    if (!this.db) await this.connect();

    try {
      await this.db!.put(storeName, value, key);
    } catch (error) {
      console.error(`Failed to set ${key} in ${storeName}:`, error);
      throw error;
    }
  }

  async remove(storeName: string, key: string): Promise<void> {
    if (!this.db) await this.connect();

    try {
      await this.db!.delete(storeName, key);
    } catch (error) {
      console.error(`Failed to remove ${key} from ${storeName}:`, error);
      throw error;
    }
  }

  async clear(storeName: string): Promise<void> {
    if (!this.db) await this.connect();

    try {
      await this.db!.clear(storeName);
    } catch (error) {
      console.error(`Failed to clear ${storeName}:`, error);
      throw error;
    }
  }

  async keys(storeName: string): Promise<string[]> {
    if (!this.db) await this.connect();

    try {
      return await this.db!.getAllKeys(storeName) as string[];
    } catch (error) {
      console.error(`Failed to get keys from ${storeName}:`, error);
      return [];
    }
  }

  async count(storeName: string): Promise<number> {
    if (!this.db) await this.connect();

    try {
      return await this.db!.count(storeName);
    } catch (error) {
      console.error(`Failed to count ${storeName}:`, error);
      return 0;
    }
  }

  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

// Singleton instance
export const indexedDB = new IndexedDBClient();