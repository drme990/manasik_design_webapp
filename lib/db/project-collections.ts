/**
 * Shared helpers for accessing the split project collections.
 *
 * Projects are stored in two collections:
 *   - `design_projects` — user designs (kind='design') + order designs (kind='order_design')
 *   - `design_booking_templates` — booking templates (kind='booking_template')
 *
 * Use `findProjectById` to search both collections in one call.
 */

import { getMongoClient } from '@/lib/db/mongodb';
import type { Project } from '@/types';

export const DESIGN_PROJECTS_COLLECTION = 'design_projects';
export const BOOKING_TEMPLATES_COLLECTION = 'design_booking_templates';

/** Get a typed collection by name (connects if needed). */
export async function getProjectCollection(name: string) {
  const client = getMongoClient();
  if (!client.isConnected()) {
    await client.connect();
  }
  const collection = client.getCollection<Project>(name);
  if (!collection) {
    throw new Error(`Collection "${name}" not available`);
  }
  return collection;
}

/**
 * Find a project by ID across both collections (designs + templates).
 * Tries `design_projects` first (most common), then `design_booking_templates`.
 * Returns the project and the collection name it was found in.
 */
export async function findProjectById(
  projectId: string,
): Promise<{ project: Project | null; collectionName: string | null }> {
  const designsCol = await getProjectCollection(DESIGN_PROJECTS_COLLECTION);
  let project = await designsCol.findOne({ id: projectId });
  if (project) return { project, collectionName: DESIGN_PROJECTS_COLLECTION };

  const templatesCol = await getProjectCollection(BOOKING_TEMPLATES_COLLECTION);
  project = await templatesCol.findOne({ id: projectId });
  if (project) return { project, collectionName: BOOKING_TEMPLATES_COLLECTION };

  return { project: null, collectionName: null };
}
