/**
 * Shared-layer reference check for R2 cleanup.
 *
 * Layer image/shape keys (`design/projects-images/`) are stored WITHOUT
 * a project-id segment, and layer objects are copied by reference when
 * a template is duplicated or inflated into an order design. That means
 * the same URL can be referenced by many documents — deleting the file
 * when one project is deleted breaks every other project using it.
 *
 * `filterUnreferencedKeys` checks both project collections and keeps
 * only the candidate keys that no *other* document references.
 */

import {
  getProjectCollection,
  DESIGN_PROJECTS_COLLECTION,
  BOOKING_TEMPLATES_COLLECTION,
} from '@/lib/db/project-collections';
import { extractKeyFromUrl, PUBLIC_URL } from '@/lib/storage/r2';
import type { ImageLayer, ShapeLayer } from '@/types';

/** Every document field that can hold an R2 URL. */
const URL_FIELD_FILTERS = (urls: string[]) => ({
  $or: [
    { 'layers.uri': { $in: urls } },
    { 'layers.originalUri': { $in: urls } },
    { 'layers.thumbnailUri': { $in: urls } },
    { 'layers.collage.cells.uri': { $in: urls } },
    { backgroundUri: { $in: urls } },
    { backgroundThumbnailUri: { $in: urls } },
    { orderDesignUrl: { $in: urls } },
  ],
});

const URL_FIELD_PROJECTION = {
  id: 1,
  'layers.uri': 1,
  'layers.originalUri': 1,
  'layers.thumbnailUri': 1,
  'layers.collage.cells.uri': 1,
  backgroundUri: 1,
  backgroundThumbnailUri: 1,
  orderDesignUrl: 1,
} as const;

/** Collect every R2 key referenced by a document's URL fields. */
function collectReferencedKeys(doc: {
  backgroundUri?: string;
  backgroundThumbnailUri?: string;
  orderDesignUrl?: string;
  layers?: Array<{
    type?: string;
    uri?: string;
    originalUri?: string;
    thumbnailUri?: string;
    collage?: { cells?: Array<{ uri?: string }> };
  }>;
}): Set<string> {
  const keys = new Set<string>();
  const add = (url?: string) => {
    if (!url) return;
    const key = extractKeyFromUrl(url);
    if (key) keys.add(key);
  };

  add(doc.backgroundUri);
  add(doc.backgroundThumbnailUri);
  add(doc.orderDesignUrl);

  for (const layer of doc.layers ?? []) {
    if (layer.type === 'image') {
      const img = layer as ImageLayer;
      add(img.uri);
      add(img.originalUri);
      add(img.thumbnailUri);
      for (const cell of img.collage?.cells ?? []) add(cell.uri);
    }
    if (layer.type === 'shape') {
      const shape = layer as ShapeLayer;
      add(shape.uri);
      add(shape.thumbnailUri);
    }
  }

  return keys;
}

/**
 * Given candidate R2 keys (typically layer image keys collected from a
 * project being deleted), return only the keys that are NOT referenced
 * by any other project or booking template.
 *
 * @param candidateKeys   R2 keys being considered for deletion
 * @param excludeIds      Project ids being deleted (their own references
 *                        don't count — they're going away)
 */
export async function filterUnreferencedKeys(
  candidateKeys: string[],
  excludeIds: string[],
): Promise<string[]> {
  if (!PUBLIC_URL || candidateKeys.length === 0) return candidateKeys;

  const candidateUrls = candidateKeys.map((key) => `${PUBLIC_URL}/${key}`);
  const referenced = new Set<string>();
  const filter = {
    id: { $nin: excludeIds },
    ...URL_FIELD_FILTERS(candidateUrls),
  };

  for (const name of [DESIGN_PROJECTS_COLLECTION, BOOKING_TEMPLATES_COLLECTION]) {
    const collection = await getProjectCollection(name);
    const docs = await collection
      .find(filter, { projection: URL_FIELD_PROJECTION })
      .toArray();
    for (const doc of docs) {
      for (const key of collectReferencedKeys(doc)) {
        referenced.add(key);
      }
    }
  }

  return candidateKeys.filter((key) => !referenced.has(key));
}
