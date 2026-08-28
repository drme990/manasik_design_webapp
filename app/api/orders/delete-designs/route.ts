import { NextRequest, NextResponse } from 'next/server';
import { getMongoClient } from '@/lib/db/mongodb';
import { deleteMultipleFromR2, extractKeyFromUrl, generateThumbnailKey } from '@/lib/storage/r2';
import type { Project } from '@/types';

const PROJECTS_COLLECTION = 'projects';

/**
 * Shared secret for callback authentication.
 * Same as the generate-design route — the backend sends this in the
 * `x-callback-secret` header.
 */
function getCallbackSecret(): string | null {
  return process.env.CALLBACK_SECRET || null;
}

function verifyCallback(request: NextRequest): boolean {
  const secret = getCallbackSecret();
  if (!secret) return false;
  const provided = request.headers.get('x-callback-secret');
  if (!provided) return false;
  return provided.length === secret.length && provided === secret;
}

/**
 * R2 key prefixes for project-specific assets that are safe to delete
 * when the project is deleted. Shared/global assets (shapes, fonts) are
 * NOT included here — they're referenced by many projects and must never
 * be deleted as part of a single project's cleanup.
 */
const PROJECT_SPECIFIC_PREFIXES = [
  'design/projects-images/',  // images uploaded to this project
  'design/thumbnails/',       // this project's thumbnail
  'design/orders-design/',    // generated order design JPGs
];

/**
 * Check if an R2 key belongs to a project-specific asset that can be
 * safely deleted when the project is deleted.
 *
 * Shared assets under `design/` that must NOT be deleted:
 *   - `design/shapes/`    — user-uploaded PNG shapes, shared across all
 *                            projects and templates
 *   - `design/fonts/`     — font files, shared across all projects
 *
 * Files outside `design/` (e.g. `images/customers/`) are owned by the
 * backend — they're customer-uploaded photos referenced by design
 * instances but not owned by them. Deleting them would destroy the
 * original customer photos.
 */
function isDesignOwnedKey(key: string): boolean {
  return PROJECT_SPECIFIC_PREFIXES.some((prefix) => key.startsWith(prefix));
}

/**
 * POST /api/orders/delete-designs
 *
 * Called by the backend to delete design instance projects created for
 * an order. This cleans up:
 *   - The design project documents from MongoDB
 *   - The generated JPG from R2 (design/orders-design/{orderNumber}*.jpg)
 *   - The project thumbnail from R2 (design/thumbnails/{projectId}.webp)
 *   - Any design-app-owned image layer assets uploaded to R2
 *
 * IMPORTANT: Only deletes R2 assets under the `design/` folder. Image
 * layers in order-generated designs may reference customer photos at
 * `images/customers/...` — those are NOT deleted.
 *
 * Body: { projectIds: string[] }
 * Response: { success: true, data: { deleted: number } }
 */
export async function POST(request: NextRequest) {
  if (!verifyCallback(request)) {
    return NextResponse.json(
      { success: false, error: 'unauthorized' },
      { status: 401 },
    );
  }

  try {
    const body = await request.json();
    const projectIds: string[] = Array.isArray(body?.projectIds) ? body.projectIds : [];

    if (projectIds.length === 0) {
      return NextResponse.json({ success: true, data: { deleted: 0 } });
    }

    const client = getMongoClient();
    if (!client.isConnected()) {
      await client.connect();
    }
    const collection = client.getCollection<Project>(PROJECTS_COLLECTION);
    if (!collection) {
      throw new Error('Projects collection not available');
    }

    // Find all projects to collect R2 keys for cleanup
    const projects = await collection
      .find({ id: { $in: projectIds } })
      .toArray();

    // Collect R2 keys: order design image, thumbnail, layer images.
    // Only collect keys under the `design/` folder — customer photos
    // at `images/customers/...` are NOT deleted (owned by the backend).
    //
    // IMPORTANT: Background images are NOT deleted here. These are
    // design instances (source='order') that share the template's bg URL.
    // Deleting the bg would break the template and all other design
    // instances that reference the same bg. The bg is only cleaned up
    // when the template itself is deleted (see DELETE /api/projects/[id]).
    const r2Keys: string[] = [];
    for (const project of projects) {
      // The generated design JPG (stored on the project as orderDesignUrl)
      if (project.orderDesignUrl) {
        const key = extractKeyFromUrl(project.orderDesignUrl);
        if (key && isDesignOwnedKey(key)) r2Keys.push(key);
      }
      // Project thumbnail
      r2Keys.push(generateThumbnailKey(project.id));
      // Layer image URIs
      // Layer image URIs
      for (const layer of project.layers) {
        if (layer.type === 'image') {
          const img = layer as import('@/types').ImageLayer;
          if (img.uri) {
            const key = extractKeyFromUrl(img.uri);
            if (key && isDesignOwnedKey(key)) r2Keys.push(key);
          }
          if (img.thumbnailUri) {
            const key = extractKeyFromUrl(img.thumbnailUri);
            if (key && isDesignOwnedKey(key)) r2Keys.push(key);
          }
          if (img.collage?.cells) {
            for (const cell of img.collage.cells) {
              if (cell.uri) {
                const key = extractKeyFromUrl(cell.uri);
                if (key && isDesignOwnedKey(key)) r2Keys.push(key);
              }
            }
          }
        }
        if (layer.type === 'shape') {
          const shape = layer as import('@/types').ShapeLayer;
          if (shape.uri) {
            const key = extractKeyFromUrl(shape.uri);
            if (key && isDesignOwnedKey(key)) r2Keys.push(key);
          }
        }
      }
    }

    // Deduplicate
    const uniqueKeys = [...new Set(r2Keys)];

    // Audit log: record what's being deleted
    console.log(
      `[POST /api/orders/delete-designs] Deleting ${projectIds.length} project(s): ${projectIds.join(', ')}. ` +
      `R2 keys to delete (${uniqueKeys.length}): ${uniqueKeys.join(', ') || 'none'}`,
    );

    // Delete projects from MongoDB
    const deleteResult = await collection.deleteMany({
      id: { $in: projectIds },
    });

    // Delete R2 assets in the background (best-effort)
    if (uniqueKeys.length > 0) {
      deleteMultipleFromR2(uniqueKeys).catch((err) => {
        console.error('[delete-designs] R2 cleanup failed:', err);
      });
    }

    return NextResponse.json({
      success: true,
      data: { deleted: deleteResult.deletedCount },
    });
  } catch (error) {
    console.error('[POST /api/orders/delete-designs]', error);
    return NextResponse.json(
      { success: false, error: 'serverError' },
      { status: 500 },
    );
  }
}
