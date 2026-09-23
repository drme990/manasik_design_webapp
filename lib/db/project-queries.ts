/**
 * Server-side data access for list pages.
 *
 * Server Components query MongoDB directly here instead of round-tripping
 * through /api/projects over HTTP — same collection, same filters, same
 * sort, same `layers` projection as GET /api/projects?summary=1. Used to
 * ship the first paint with real data (no client fetch waterfall).
 */

import { getMongoClient } from './mongodb';
import { getProjectCollection, DESIGN_PROJECTS_COLLECTION } from './project-collections';
import type { PdfProject, ProjectSummary } from '@/types';

/**
 * List a user's most recent designs (kind='design'), newest first,
 * without `layers`. The result is serialized into the RSC payload as
 * `initialProjects` — bounding it keeps that payload small (~KBs
 * instead of MBs for users with hundreds of designs) so client-side
 * navigations to `/` stay fast. The client refetches the full list in
 * the background after mount.
 */
export const DESIGN_SEED_LIMIT = 50;

/**
 * Strip embedded `data:` URIs from list payloads. Projects created via
 * "pick from gallery" used to store the image as a base64 data URI in
 * `backgroundUri` — a single doc can carry megabytes, and the
 * `layers: 0` projection doesn't catch it. Real R2 URLs stay (they're
 * ~100 bytes and the card preview uses them); only data: URIs are
 * dropped — the preview falls back to backgroundColor for those cards.
 */
export function stripSummaryDataUris<T extends { backgroundUri?: string; backgroundThumbnailUri?: string }>(doc: T): T {
  return {
    ...doc,
    backgroundUri: doc.backgroundUri?.startsWith('data:') ? undefined : doc.backgroundUri,
    backgroundThumbnailUri: doc.backgroundThumbnailUri?.startsWith('data:') ? undefined : doc.backgroundThumbnailUri,
  };
}

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
  return docs.map((doc) => stripSummaryDataUris({ ...doc, _id: doc._id?.toString() }));
}

const PDF_PROJECTS_COLLECTION = 'design_pdf_projects';

/**
 * List a user's PDF projects, newest first. Mirrors
 * `GET /api/pdf-projects` — separate `design_pdf_projects` collection,
 * so this query is independent of `design_projects` load and streams
 * into its own Suspense boundary on `/`.
 */
export async function listUserPdfProjects(userId: string): Promise<PdfProject[]> {
  const client = getMongoClient();
  if (!client.isConnected()) {
    await client.connect();
  }
  const collection = client.getCollection<PdfProject>(PDF_PROJECTS_COLLECTION);
  if (!collection) {
    throw new Error('PDF projects collection not available');
  }
  const docs = await collection
    .find({ userId })
    .sort({ updatedAt: -1 })
    .allowDiskUse(true)
    .toArray();
  return docs.map((doc) => ({ ...doc, _id: doc._id?.toString() }));
}
