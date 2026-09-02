import { NextRequest, NextResponse } from 'next/server';
import { getProjectCollection, DESIGN_PROJECTS_COLLECTION } from '@/lib/db/project-collections';
import { deleteMultipleFromR2, extractKeyFromUrl } from '@/lib/storage/r2';
import type { ImageLayer, ShapeLayer } from '@/types';

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
 *
 * `design/template-bg/` is included because order designs now get their
 * OWN copy of the BG file (copied during generation in
 * generate-design/route.ts). The copy uses the design instance's ID as
 * the subfolder, so it's safe to delete — it won't affect the template
 * or other order designs.
 */
const PROJECT_SPECIFIC_PREFIXES = [
  'design/projects-images/',  // images uploaded to this project
  'design/thumbnails/',       // this project's thumbnail
  'design/orders-design/',    // generated order design JPGs
  'design/template-bg/',      // per-design BG copies (owned by the design instance)
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
 * Check if a background image URL is owned by the given project.
 * Background keys have the format: design/template-bg/{projectId}/{filename}
 * Only delete BGs whose {projectId} subfolder matches the project being deleted.
 */
function isBackgroundOwnedByProject(bgUrl: string, projectId: string): boolean {
  const key = extractKeyFromUrl(bgUrl);
  if (!key) return false;
  const parts = key.split('/');
  if (parts.length < 4) return false;
  if (parts[0] !== 'design' || parts[1] !== 'template-bg') return false;
  const keyProjectId = parts[2];
  const safeProjectId = projectId.replace(/[^a-zA-Z0-9-_]/g, '-').slice(0, 40);
  return keyProjectId === safeProjectId;
}

/**
 * POST /api/orders/delete-designs
 *
 * Called by the backend to delete design instance projects created for
 * an order. This cleans up:
 *   - The design project documents from MongoDB
 *   - The generated JPG from R2 (design/orders-design/{orderNumber}*.jpg)
 *   - Any design-app-owned image layer assets uploaded to R2
 *
 * Note: Order designs do NOT have thumbnails — the design JPG itself
 * is used as the thumbnail (see ProjectCardPreview). So there's no
 * thumbnail key to delete.
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

    const collection = await getProjectCollection(DESIGN_PROJECTS_COLLECTION);

    // Find all projects to collect R2 keys for cleanup
    const projects = await collection
      .find({ id: { $in: projectIds } })
      .toArray();

    // Collect R2 keys: order design image, layer images, per-design BG.
    // Only collect keys under the `design/` folder — customer photos
    // at `images/customers/...` are NOT deleted (owned by the backend).
    //
    // Background images: order designs now get their OWN copy of the BG
    // file (copied during generation). We delete only BGs that belong to
    // the design instance being deleted (verified by the {templateId}
    // subfolder in the R2 key matching the design instance's ID).
    // This prevents deleting a BG that belongs to the template or
    // another design instance.
    //
    // IMPORTANT: Order designs do NOT have thumbnails. The design JPG
    // itself is used as the thumbnail (see ProjectCardPreview). Skip
    // thumbnail key collection for order designs.
    const r2Keys: string[] = [];
    for (const project of projects) {
      // The generated design JPG (stored on the project as orderDesignUrl)
      if (project.orderDesignUrl) {
        const key = extractKeyFromUrl(project.orderDesignUrl);
        if (key && isDesignOwnedKey(key)) r2Keys.push(key);
      }
      // Per-design BG copy (only if owned by this design instance)
      if (project.backgroundUri) {
        const key = extractKeyFromUrl(project.backgroundUri);
        if (key && isDesignOwnedKey(key) && isBackgroundOwnedByProject(project.backgroundUri, project.id)) {
          r2Keys.push(key);
        }
      }
      // Layer image URIs
      for (const layer of project.layers) {
        if (layer.type === 'image') {
          const img = layer as ImageLayer;
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
          const shape = layer as ShapeLayer;
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
