/**
 * Server-side data access for list pages.
 *
 * Server Components query MongoDB directly here instead of round-tripping
 * through /api/projects over HTTP — same collection, same filters, same
 * sort, same `layers` projection as GET /api/projects?summary=1. Used to
 * ship the first paint with real data (no client fetch waterfall).
 */

import { getProjectCollection, DESIGN_PROJECTS_COLLECTION } from './project-collections';
import type { ProjectSummary } from '@/types';

/**
 * List a user's designs (kind='design'), newest first, without `layers`.
 * Mirrors the `GET /api/projects?summary=1` response for the default
 * (non-order, non-template) query.
 */
export async function listUserDesignSummaries(userId: string): Promise<ProjectSummary[]> {
  const collection = await getProjectCollection(DESIGN_PROJECTS_COLLECTION);
  const docs = await collection
    .find({ userId, kind: 'design' }, { projection: { layers: 0 } })
    .sort({ updatedAt: -1 })
    .allowDiskUse(true)
    .toArray();
  // Convert MongoDB ObjectId _id to string so the docs are serializable
  // across the Server→Client component boundary.
  return docs.map((doc) => ({ ...doc, _id: doc._id?.toString() }));
}
