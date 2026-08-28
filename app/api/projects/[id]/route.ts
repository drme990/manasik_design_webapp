import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/lib/auth/session';
import { getMongoClient } from '@/lib/db/mongodb';
import { deleteMultipleFromR2, extractKeyFromUrl, generateThumbnailKey } from '@/lib/storage/r2';
import type { Project, ProjectUpdateInput, ImageLayer, ShapeLayer } from '@/types';
import type { BookingProduct } from '@/types/booking';

const COLLECTION = 'projects';
const BOOKING_PRODUCTS_COLLECTION = 'booking_products';

function isAdmin(role?: string) {
  return role === 'admin' || role === 'super_admin';
}

/**
 * Verify a callback request from the backend (shared secret).
 * Used by the admin panel's order-designs page to delete designs
 * via the backend proxy without a user JWT session.
 */
function verifyCallbackSecret(request: NextRequest): boolean {
  const secret = process.env.CALLBACK_SECRET;
  if (!secret) return false;
  const provided = request.headers.get('x-callback-secret');
  if (!provided) return false;
  if (provided.length !== secret.length) return false;
  return provided === secret;
}

interface RouteParams {
  params: Promise<{ id: string }>;
}

async function getCollection() {
  const client = getMongoClient();
  if (!client.isConnected()) {
    await client.connect();
  }
  const collection = client.getCollection<Project>(COLLECTION);
  if (!collection) {
    throw new Error('Projects collection not available');
  }
  return collection;
}

async function verifyAccess(projectId: string, userId: string, role?: string): Promise<Project | null> {
  const collection = await getCollection();
  const project = await collection.findOne({ id: projectId });
  if (!project) return null;
  if (project.kind === 'booking_template') return project;
  if (project.userId === userId) return project;
  if (isAdmin(role)) return project;
  return null;
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const session = await verifySession();
    if (!session) {
      return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const project = await verifyAccess(id, session.id, session.role);
    if (!project) {
      return NextResponse.json({ success: false, error: 'notFound' }, { status: 404 });
    }

    // Convert MongoDB ObjectId _id to string for JSON serialization
    return NextResponse.json({
      success: true,
      data: { ...project, _id: project._id?.toString() },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[GET /api/projects/[id]]', message, error);
    return NextResponse.json(
      { success: false, error: 'serverError', message },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await verifySession();
    if (!session) {
      return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const existing = await verifyAccess(id, session.id, session.role);
    if (!existing) {
      return NextResponse.json({ success: false, error: 'notFound' }, { status: 404 });
    }

    if (existing.kind === 'booking_template' && !isAdmin(session.role)) {
      return NextResponse.json({ success: false, error: 'forbidden' }, { status: 403 });
    }

    const body = (await request.json()) as ProjectUpdateInput;
    // Strip fields that must never be overwritten by a client update
    const safeBody = { ...body } as Record<string, unknown>;
    delete safeBody._id;
    delete safeBody.id;
    delete safeBody.userId;
    const updates: Partial<Project> = {
      ...(safeBody as ProjectUpdateInput),
      updatedAt: Date.now(),
      localModifiedAt: Date.now(),
      // Mark as synced on first save (syncedAt is not set at creation time)
      syncedAt: existing.syncedAt ?? Date.now(),
      syncStatus: 'synced',
    };

    const collection = await getCollection();
    await collection.updateOne({ id }, { $set: updates });
    const updated = await collection.findOne({ id });

    return NextResponse.json({
      success: true,
      data: updated ? { ...updated, _id: updated._id?.toString() } : null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[PATCH /api/projects/[id]]', message, error);
    return NextResponse.json(
      { success: false, error: 'serverError', message },
      { status: 500 },
    );
  }
}

/**
 * R2 key prefixes for project-specific assets that are safe to delete
 * when the project is deleted. Shared/global assets (shapes, fonts) are
 * NOT included here — they're referenced by many projects and must never
 * be deleted as part of a single project's cleanup.
 *
 * `design/template-bg/` is only deleted for booking_template projects —
 * design instances (source='order') share the template's bg URL, so
 * deleting a design instance must NOT delete the bg (the template owns it).
 */
const PROJECT_SPECIFIC_PREFIXES = [
  'design/projects-images/',  // images uploaded to this project
  'design/thumbnails/',       // this project's thumbnail
  'design/orders-design/',    // generated order design JPGs
  'design/template-bg/',      // template background images (templates only!)
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
 * backend and must NOT be deleted — they're customer-uploaded photos
 * referenced by design instances but not owned by them.
 */
function isDesignOwnedKey(key: string): boolean {
  return PROJECT_SPECIFIC_PREFIXES.some((prefix) => key.startsWith(prefix));
}

/**
 * Collect all R2 URLs from a project that should be deleted when the
 * project is deleted: background, thumbnail, image layer URIs, shape URIs,
 * and collage cell URIs.
 *
 * IMPORTANT: Only collects keys under the `design/` folder. Image layers
 * in order-generated designs may reference customer photos stored at
 * `images/customers/...` — those are owned by the backend and must not
 * be deleted here.
 *
 * IMPORTANT: Background images (`design/template-bg/`) are ONLY deleted
 * for booking_template projects. Design instances (source='order') share
 * the template's bg URL — deleting the bg when a design instance is
 * deleted would break the template and all other design instances that
 * reference the same bg.
 */
function collectProjectR2Keys(project: Project): string[] {
  const keys: string[] = [];

  // Thumbnail (stored at a predictable key)
  keys.push(generateThumbnailKey(project.id));

  // Background image — only delete for templates, NOT for design instances.
  // Design instances (source='order') inherit the template's bg URL via
  // the spread in inflateTemplateToDesign. Deleting it here would remove
  // the bg from R2, breaking the template and every other design instance
  // that shares the same bg.
  const isTemplate = project.kind === 'booking_template';
  if (isTemplate) {
    if (project.backgroundUri) {
      const key = extractKeyFromUrl(project.backgroundUri);
      if (key && isDesignOwnedKey(key)) keys.push(key);
    }
    if (project.backgroundThumbnailUri) {
      const key = extractKeyFromUrl(project.backgroundThumbnailUri);
      if (key && isDesignOwnedKey(key)) keys.push(key);
    }
  }

  // Layer URIs
  for (const layer of project.layers) {
    if (layer.type === 'image') {
      const img = layer as ImageLayer;
      if (img.uri) {
        const key = extractKeyFromUrl(img.uri);
        if (key && isDesignOwnedKey(key)) keys.push(key);
      }
      if (img.originalUri) {
        const key = extractKeyFromUrl(img.originalUri);
        if (key && isDesignOwnedKey(key)) keys.push(key);
      }
      if (img.thumbnailUri) {
        const key = extractKeyFromUrl(img.thumbnailUri);
        if (key && isDesignOwnedKey(key)) keys.push(key);
      }
      // Collage cell URIs
      if (img.collage?.cells) {
        for (const cell of img.collage.cells) {
          if (cell.uri) {
            const key = extractKeyFromUrl(cell.uri);
            if (key && isDesignOwnedKey(key)) keys.push(key);
          }
        }
      }
    }
    if (layer.type === 'shape') {
      const shape = layer as ShapeLayer;
      if (shape.uri) {
        const key = extractKeyFromUrl(shape.uri);
        if (key && isDesignOwnedKey(key)) keys.push(key);
      }
      if (shape.thumbnailUri) {
        const key = extractKeyFromUrl(shape.thumbnailUri);
        if (key && isDesignOwnedKey(key)) keys.push(key);
      }
    }
  }

  // Deduplicate (a single image might be used multiple times)
  return [...new Set(keys)];
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await verifySession();
    const isCallback = verifyCallbackSecret(request);
    if (!session && !isCallback) {
      return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    // For callback auth, skip userId check — the backend is trusted.
    // For session auth, use the normal access check.
    const existing = isCallback
      ? await (await getCollection()).findOne({ id })
      : await verifyAccess(id, session!.id, session!.role);
    if (!existing) {
      return NextResponse.json({ success: false, error: 'notFound' }, { status: 404 });
    }

    // Callback auth can only delete order designs (source='order')
    if (isCallback && existing.source !== 'order') {
      return NextResponse.json(
        { success: false, error: 'Callback auth can only delete order designs' },
        { status: 403 },
      );
    }

    if (existing.kind === 'booking_template' && !isCallback && !isAdmin(session!.role)) {
      return NextResponse.json({ success: false, error: 'forbidden' }, { status: 403 });
    }

    // Collect all R2 keys to delete (images, thumbnail, etc.)
    const r2Keys = collectProjectR2Keys(existing);

    // Audit log: record what's being deleted and by whom
    const actor = isCallback
      ? 'backend-callback'
      : `${session!.id} (${session!.role})`;
    console.log(
      `[DELETE /api/projects/[id]] Deleting project ${id} (kind=${existing.kind}, source=${existing.source || 'n/a'}) by ${actor}. ` +
      `R2 keys to delete (${r2Keys.length}): ${r2Keys.join(', ') || 'none'}`,
    );

    const collection = await getCollection();
    await collection.deleteOne({ id });

    // If this is a booking template, disconnect it from all booking
    // products that reference it via any of the 4 template slots.
    // This prevents products from pointing to a deleted template.
    if (existing.kind === 'booking_template') {
      const mongoClient = getMongoClient();
      const bpCollection = mongoClient.getCollection<BookingProduct>(BOOKING_PRODUCTS_COLLECTION);
      if (bpCollection) {
        const now = Date.now();
        // Clear all 4 possible slots that could reference this template
        await bpCollection.updateMany(
          { templateId: id },
          { $set: { templateId: null, updatedAt: now, localModifiedAt: now } },
        );
        await bpCollection.updateMany(
          { imageTemplateId: id },
          { $set: { imageTemplateId: null, updatedAt: now, localModifiedAt: now } },
        );
        await bpCollection.updateMany(
          { ghadaqTemplateId: id },
          { $set: { ghadaqTemplateId: null, updatedAt: now, localModifiedAt: now } },
        );
        await bpCollection.updateMany(
          { ghadaqImageTemplateId: id },
          { $set: { ghadaqImageTemplateId: null, updatedAt: now, localModifiedAt: now } },
        );
      }
    }

    // Delete all R2 assets in the background (best-effort, non-blocking)
    if (r2Keys.length > 0) {
      deleteMultipleFromR2(r2Keys).catch((err) => {
        console.error(`[DELETE /api/projects/[id]] R2 cleanup failed for ${id}:`, err);
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[DELETE /api/projects/[id]]', message, error);
    return NextResponse.json(
      { success: false, error: 'serverError', message },
      { status: 500 },
    );
  }
}
