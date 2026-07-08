import type { BookingProduct, BookingProductCreateInput, BookingProductUpdateInput } from '@/types';
import { indexedDB } from '../indexeddb';
import { getMongoClient } from '../mongodb';
import type { Filter, UpdateFilter } from 'mongodb';

export class BookingProductsRepository {
  private readonly storeName = 'booking_products' as const;
  private readonly collectionName = 'booking_products' as const;

  async findAll(): Promise<BookingProduct[]> {
    try {
      const products = await indexedDB.getAll<BookingProduct>(this.storeName);
      return products;
    } catch (error) {
      console.error('Failed to fetch booking products:', error);
      return [];
    }
  }

  async findById(id: string): Promise<BookingProduct | null> {
    try {
      const product = await indexedDB.get<BookingProduct>(this.storeName, id);
      return product;
    } catch (error) {
      console.error('Failed to fetch booking product:', error);
      return null;
    }
  }

  async create(input: BookingProductCreateInput): Promise<BookingProduct> {
    const now = Date.now();
    const product: BookingProduct = {
      id: this.generateId(),
      name: input.name,
      imageUri: input.imageUri,
      defaultCanvas: input.defaultCanvas,
      templates: {
        withImage: { single: null, double: null, multiple: null },
        withoutImage: { single: null, double: null, multiple: null }
      },
      createdAt: now,
      updatedAt: now,
      localModifiedAt: now,
      syncStatus: 'pending',
      userId: input.userId
    };

    await indexedDB.set(this.storeName, product.id, product);
    return product;
  }

  async update(id: string, updates: BookingProductUpdateInput): Promise<BookingProduct | null> {
    const existing = await this.findById(id);
    if (!existing) return null;

    const updated: BookingProduct = {
      ...existing,
      ...updates,
      id,
      updatedAt: Date.now(),
      localModifiedAt: Date.now(),
      syncStatus: 'pending'
    };

    await indexedDB.set(this.storeName, id, updated);
    return updated;
  }

  async delete(id: string): Promise<void> {
    await indexedDB.remove(this.storeName, id);
  }

  async syncWithRemote(): Promise<void> {
    const mongoClient = getMongoClient();

    if (!mongoClient.isConnected()) {
      try {
        await mongoClient.connect();
      } catch (error) {
        console.error('Failed to connect to MongoDB:', error);
        return;
      }
    }

    const collection = mongoClient.getCollection<BookingProduct>(this.collectionName);
    if (!collection) return;

    try {
      const localProducts = await this.findAll();

      for (const product of localProducts) {
        if (product.syncStatus === 'pending') {
          const filter: Filter<BookingProduct> = { id: product.id };
          const existing = await collection.findOne(filter);

          if (existing) {
            const update: UpdateFilter<BookingProduct> = { $set: product };
            await collection.updateOne(filter, update);
          } else {
            await collection.insertOne(product);
          }

          const updated = {
            ...product,
            syncStatus: 'synced' as const,
            syncedAt: Date.now()
          };
          await indexedDB.set(this.storeName, product.id, updated);
        }
      }

      const filter: Filter<BookingProduct> = {};
      const remoteProducts = await mongoClient.find<BookingProduct>(this.collectionName, filter);

      for (const remoteProduct of remoteProducts) {
        const local = await this.findById(remoteProduct.id);

        if (!local) {
          await indexedDB.set(this.storeName, remoteProduct.id, {
            ...remoteProduct,
            syncStatus: 'synced' as const
          });
        } else if (remoteProduct.updatedAt > local.updatedAt) {
          await indexedDB.set(this.storeName, remoteProduct.id, {
            ...remoteProduct,
            syncStatus: 'synced' as const
          });
        }
      }
    } catch (error) {
      console.error('Sync failed:', error);
    }
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}