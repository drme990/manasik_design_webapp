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
 * List a user's most recent designs (kind='design'), newest first,
 * without `layers`. The result is serialized into the RSC payload as
 * `initialProjects` — bounding it keeps that payload small (~KBs
 * instead of MBs for users with hundreds of designs) so client-side
 * navigations to `/` stay fast. The client refetches the full list in
 * the background after mount.
 */
export const DESIGN_SEED_LIMIT = 50;

export async function listUserDesignSummaries(userId: string, limit = DESIGN_SEED_LIMIT): Promise<ProjectSummary[]> {
  const collection = await getProjectCollection(DESIGN_PROJECTS_COLLECTION);
  const docs = await collection
    .find({ userId, kind: 'design' }, { projection: { layers: 0 } })
    .sort({ updatedAt: -1 })
    .limit(limit)
    .allowDiskUse(true)
    .toArray();
  // Convert MongoDB ObjectId _id to string so the docs are serializable
  // across the Server→Client component boundary.
  return docs.map((doc) => ({ ...doc, _id: doc._id?.toString() }));
}
