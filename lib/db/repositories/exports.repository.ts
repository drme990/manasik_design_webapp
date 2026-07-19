import type { ExportedItem, PdfProject, PdfImage, SyncableDocument, ExportType } from '@/types';
import { indexedDB } from '../indexeddb';
import { getMongoClient } from '../mongodb';
import type { Collection, Filter, UpdateFilter, WithId, OptionalUnlessRequiredId } from 'mongodb';

export class ExportsRepository {
  private readonly exportsStoreName = 'exports' as const;
  private readonly pdfProjectsStoreName = 'pdf_projects' as const;
  private readonly exportsCollectionName = 'exports' as const;
  private readonly pdfProjectsCollectionName = 'pdf_projects' as const;

  async findExports(): Promise<ExportedItem[]> {
    try {
      const exports = await indexedDB.getAll<ExportedItem>(this.exportsStoreName);
      return exports;
    } catch (error) {
      console.error('Failed to fetch exports:', error);
      return [];
    }
  }

  async findPdfProjects(): Promise<PdfProject[]> {
    try {
      const pdfProjects = await indexedDB.getAll<PdfProject>(this.pdfProjectsStoreName);
      return pdfProjects;
    } catch (error) {
      console.error('Failed to fetch PDF projects:', error);
      return [];
    }
  }

  async findExportById(id: string): Promise<ExportedItem | null> {
    try {
      const exportItem = await indexedDB.get<ExportedItem>(this.exportsStoreName, id);
      return exportItem;
    } catch (error) {
      console.error('Failed to fetch export:', error);
      return null;
    }
  }

  async findPdfProjectById(id: string): Promise<PdfProject | null> {
    try {
      const pdfProject = await indexedDB.get<PdfProject>(this.pdfProjectsStoreName, id);
      return pdfProject;
    } catch (error) {
      console.error('Failed to fetch PDF project:', error);
      return null;
    }
  }

  async createExport(data: Omit<ExportedItem, 'id' | 'createdAt' | 'localModifiedAt' | 'syncStatus' | 'uri' | 'type'> & { uri: string; type: ExportType }): Promise<ExportedItem> {
    const now = Date.now();
    const exportItem: ExportedItem = {
      ...data,
      id: this.generateId(),
      createdAt: now,
      localModifiedAt: now,
      syncStatus: 'pending'
    };

    await indexedDB.set(this.exportsStoreName, exportItem.id, exportItem);
    return exportItem;
  }

  async createPdfProject(name: string, images: PdfImage[]): Promise<PdfProject> {
    const now = Date.now();
    const pdfProject: PdfProject = {
      id: this.generateId(),
      name,
      images,
      createdAt: now,
      updatedAt: now,
      localModifiedAt: now,
      syncStatus: 'pending'
    };

    await indexedDB.set(this.pdfProjectsStoreName, pdfProject.id, pdfProject);
    return pdfProject;
  }

  async updateExport(id: string, updates: Partial<ExportedItem>): Promise<ExportedItem | null> {
    const existing = await this.findExportById(id);
    if (!existing) return null;

    const updated: ExportedItem = {
      ...existing,
      ...updates,
      id,
      localModifiedAt: Date.now(),
      syncStatus: 'pending'
    };

    await indexedDB.set(this.exportsStoreName, id, updated);
    return updated;
  }

  async updatePdfProject(id: string, updates: Partial<PdfProject>): Promise<PdfProject | null> {
    const existing = await this.findPdfProjectById(id);
    if (!existing) return null;

    const updated: PdfProject = {
      ...existing,
      ...updates,
      id,
      updatedAt: Date.now(),
      localModifiedAt: Date.now(),
      syncStatus: 'pending'
    };

    await indexedDB.set(this.pdfProjectsStoreName, id, updated);
    return updated;
  }

  async deleteExport(id: string): Promise<void> {
    await indexedDB.remove(this.exportsStoreName, id);
  }

  async deletePdfProject(id: string): Promise<void> {
    await indexedDB.remove(this.pdfProjectsStoreName, id);
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

    // Sync exports
    const exportsCollection = mongoClient.getCollection<ExportedItem>(this.exportsCollectionName);
    if (exportsCollection) {
      await this.syncCollection(exportsCollection, this.exportsStoreName, this.findExportById.bind(this));
    }

    // Sync PDF projects
    const pdfProjectsCollection = mongoClient.getCollection<PdfProject>(this.pdfProjectsCollectionName);
    if (pdfProjectsCollection) {
      await this.syncCollection(pdfProjectsCollection, this.pdfProjectsStoreName, this.findPdfProjectById.bind(this));
    }
  }

  private async syncCollection<T extends SyncableDocument & { updatedAt?: number }>(
    collection: Collection<T>,
    storeName: string,
    findById: (id: string) => Promise<T | null>
  ): Promise<void> {
    try {
      const localItems = await indexedDB.getAll<T>(storeName);

      for (const item of localItems) {
        if (item.syncStatus === 'pending') {
          const filter: Filter<T> = { id: item.id } as Filter<T>;
          const existing = await collection.findOne(filter);

          if (existing) {
            const update: UpdateFilter<T> = { $set: item } as UpdateFilter<T>;
            await collection.updateOne(filter, update);
          } else {
            await collection.insertOne(item as OptionalUnlessRequiredId<T>);
          }

          const updated = {
            ...item,
            syncStatus: 'synced' as const,
            syncedAt: Date.now()
          };
          await indexedDB.set(storeName, item.id, updated);
        }
      }

      const filter: Filter<T> = {} as Filter<T>;
      const remoteItems: WithId<T>[] = await collection.find(filter).toArray();

      for (const remoteItem of remoteItems) {
        const remoteId = remoteItem.id as string;
        const local = await findById(remoteId);

        if (!local) {
          await indexedDB.set(storeName, remoteId, {
            ...remoteItem,
            syncStatus: 'synced' as const
          });
        } else if (remoteItem.updatedAt && local.updatedAt && (remoteItem.updatedAt as number) > (local.updatedAt as number)) {
          await indexedDB.set(storeName, remoteId, {
            ...remoteItem,
            syncStatus: 'synced' as const
          });
        }
      }
    } catch (error) {
      console.error('Collection sync failed:', error);
    }
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}