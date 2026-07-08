import { indexedDB } from '../db/indexeddb';

export async function getItem<T>(key: string): Promise<T | null> {
  try {
    // For simplicity, we'll use a single store approach
    // In production, you'd want to use separate stores per data type
    const value = await indexedDB.get<T>('projects', key);
    return value ?? null;
  } catch (error) {
    console.error(`Failed to get item ${key}:`, error);
    return null;
  }
}

export async function setItem<T>(key: string, value: T): Promise<void> {
  try {
    await indexedDB.set('projects', key, value);
  } catch (error) {
    console.error(`Failed to set item ${key}:`, error);
    throw error;
  }
}

export async function removeItem(key: string): Promise<void> {
  try {
    await indexedDB.remove('projects', key);
  } catch (error) {
    console.error(`Failed to remove item ${key}:`, error);
    throw error;
  }
}

export async function clearAll(): Promise<void> {
  try {
    await indexedDB.clear('projects');
  } catch (error) {
    console.error('Failed to clear storage:', error);
    throw error;
  }
}

export async function getAllKeys(): Promise<string[]> {
  try {
    return await indexedDB.keys('projects');
  } catch (error) {
    console.error('Failed to get all keys:', error);
    return [];
  }
}

export const kvStorage = {
  getItem,
  setItem,
  removeItem,
  clear: clearAll,
  keys: getAllKeys
};