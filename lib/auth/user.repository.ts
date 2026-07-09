'use server';

import { getMongoClient } from '@/lib/db/mongodb';
import type { User } from '@/types/auth';

const COLLECTION_NAME = 'users_admin_panel';

export async function findUserByEmail(email: string): Promise<User | null> {
  const client = getMongoClient();

  if (!client.isConnected()) {
    try {
      await client.connect();
    } catch (error) {
      console.error('Failed to connect to MongoDB:', error);
      return null;
    }
  }

  const collection = client.getCollection<User>(COLLECTION_NAME);
  if (!collection) return null;
  return collection.findOne({ email: email.toLowerCase() });
}
