import { MongoClient, Db, Collection, Document, Filter, UpdateFilter, OptionalId, WithId, InsertOneResult, UpdateResult, DeleteResult, OptionalUnlessRequiredId } from 'mongodb';

export class MongoDBClient {
  private client: MongoClient | null = null;
  private db: Db | null = null;
  private uri: string;

  constructor(uri: string) {
    this.uri = uri;
  }

  async connect(): Promise<void> {
    if (this.client) return;

    try {
      this.client = new MongoClient(this.uri);
      await this.client.connect();
      this.db = this.client.db();
      console.log('Connected to MongoDB');
    } catch (error) {
      console.error('Failed to connect to MongoDB:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
      this.db = null;
      console.log('Disconnected from MongoDB');
    }
  }

  isConnected(): boolean {
    return this.client !== null && this.db !== null;
  }

  getCollection<T extends Document>(collectionName: string): Collection<T> | null {
    if (!this.db) {
      console.warn('MongoDB not connected');
      return null;
    }
    return this.db.collection<T>(collectionName);
  }

  async getDb(): Promise<Db | null> {
    if (!this.db) {
      await this.connect();
    }
    return this.db;
  }

  async insertOne<T extends Document>(collectionName: string, document: OptionalUnlessRequiredId<T>): Promise<InsertOneResult<T>> {
    const collection = this.getCollection<T>(collectionName);
    if (!collection) throw new Error('Collection not available');

    return await collection.insertOne(document);
  }

  async updateOne<T extends Document>(
    collectionName: string,
    filter: Filter<T>,
    update: UpdateFilter<T>,
    options: Document = {}
  ): Promise<UpdateResult<T>> {
    const collection = this.getCollection<T>(collectionName);
    if (!collection) throw new Error('Collection not available');

    return await collection.updateOne(filter, update, options);
  }

  async deleteOne<T extends Document>(collectionName: string, filter: Filter<T>): Promise<DeleteResult> {
    const collection = this.getCollection<T>(collectionName);
    if (!collection) throw new Error('Collection not available');

    return await collection.deleteOne(filter);
  }

  async find<T extends Document>(collectionName: string, filter: Filter<T> = {}, options: Document = {}): Promise<WithId<T>[]> {
    const collection = this.getCollection<T>(collectionName);
    if (!collection) throw new Error('Collection not available');

    return await collection.find(filter, options).toArray();
  }

  async findOne<T extends Document>(collectionName: string, filter: Filter<T>): Promise<WithId<T> | null> {
    const collection = this.getCollection<T>(collectionName);
    if (!collection) throw new Error('Collection not available');

    return await collection.findOne(filter);
  }

  async countDocuments<T extends Document>(collectionName: string, filter: Filter<T> = {}): Promise<number> {
    const collection = this.getCollection<T>(collectionName);
    if (!collection) throw new Error('Collection not available');

    return await collection.countDocuments(filter);
  }
}

// Singleton instance (will be initialized with actual connection string)
let mongoClient: MongoDBClient | null = null;

export function getMongoClient(uri?: string): MongoDBClient {
  if (!mongoClient) {
    const connectionString = uri || process.env.DATA_BASE_URL || process.env.MONGODB_URI || '';
    if (!connectionString) {
      throw new Error('MongoDB URI not provided');
    }
    mongoClient = new MongoDBClient(connectionString);
  }
  return mongoClient;
}

export function closeMongoClient(): Promise<void> {
  if (mongoClient) {
    return mongoClient.disconnect();
  }
  return Promise.resolve();
}