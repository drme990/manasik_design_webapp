import type { Project, ProjectCreateInput, ProjectUpdateInput } from '@/types';
import { indexedDB } from '../indexeddb';
import { getMongoClient } from '../mongodb';
import type { Filter, UpdateFilter } from 'mongodb';

export class ProjectsRepository {
  private readonly storeName = 'projects' as const;
  private readonly collectionName = 'projects' as const;

  async findAll(): Promise<Project[]> {
    // Try IndexedDB first (local storage)
    try {
      const localProjects = await indexedDB.getAll<Project>(this.storeName);
      return localProjects;
    } catch (error) {
      console.error('Failed to fetch from IndexedDB:', error);
      return [];
    }
  }

  async findById(id: string): Promise<Project | null> {
    try {
      const project = await indexedDB.get<Project>(this.storeName, id);
      return project;
    } catch (error) {
      console.error('Failed to fetch project:', error);
      return null;
    }
  }

  async create(input: ProjectCreateInput): Promise<Project> {
    const now = Date.now();
    const project: Project = {
      id: this.generateId(),
      name: input.name,
      kind: input.kind,
      canvasWidth: input.canvasWidth,
      canvasHeight: input.canvasHeight,
      backgroundUri: input.backgroundUri,
      layers: [],
      bookingMeta: input.bookingMeta,
      createdAt: now,
      updatedAt: now,
      localModifiedAt: now,
      syncStatus: 'pending',
      userId: input.userId
    };

    // Save to IndexedDB
    await indexedDB.set(this.storeName, project.id, project);

    // Queue for sync
    // This would be handled by the sync service

    return project;
  }

  async update(id: string, updates: ProjectUpdateInput): Promise<Project | null> {
    const existing = await this.findById(id);
    if (!existing) return null;

    const updated: Project = {
      ...existing,
      ...updates,
      id, // Ensure ID doesn't change
      updatedAt: Date.now(),
      localModifiedAt: Date.now(),
      syncStatus: 'pending'
    };

    // Update IndexedDB
    await indexedDB.set(this.storeName, id, updated);

    // Queue for sync
    // This would be handled by the sync service

    return updated;
  }

  async delete(id: string): Promise<void> {
    // Delete from IndexedDB
    await indexedDB.remove(this.storeName, id);

    // Queue deletion for sync
    // This would be handled by the sync service
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

    const collection = mongoClient.getCollection<Project>(this.collectionName);
    if (!collection) return;

    try {
      // Get all local projects
      const localProjects = await this.findAll();

      // Sync each project
      for (const project of localProjects) {
        if (project.syncStatus === 'pending') {
          // Check if exists in MongoDB
          const filter: Filter<Project> = { id: project.id };
          const existing = await collection.findOne(filter);

          if (existing) {
            // Update existing
            const update: UpdateFilter<Project> = { $set: project };
            await collection.updateOne(filter, update);
          } else {
            // Insert new
            await collection.insertOne(project);
          }

          // Update local sync status
          const updated = {
            ...project,
            syncStatus: 'synced' as const,
            syncedAt: Date.now()
          };
          await indexedDB.set(this.storeName, project.id, updated);
        }
      }

      // Pull remote changes
      const filter: Filter<Project> = {};
      const remoteProjects = await mongoClient.find<Project>(this.collectionName, filter);

      for (const remoteProject of remoteProjects) {
        const local = await this.findById(remoteProject.id);

        if (!local) {
          // New remote project, add to local
          await indexedDB.set(this.storeName, remoteProject.id, {
            ...remoteProject,
            syncStatus: 'synced' as const
          });
        } else if (remoteProject.updatedAt > local.updatedAt) {
          // Remote is newer, update local
          await indexedDB.set(this.storeName, remoteProject.id, {
            ...remoteProject,
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