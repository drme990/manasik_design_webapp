import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/lib/auth/session';
import { findProjectById, getProjectCollection, BOOKING_TEMPLATES_COLLECTION, DESIGN_PROJECTS_COLLECTION } from '@/lib/db/project-collections';
import { generateBackgroundKey, extractKeyFromUrl, copyR2Object } from '@/lib/storage/r2';
import { generateId } from '@/lib/utils/id';
import type { Project, TemplateApp } from '@/types';
import type { BookingProduct } from '@/types/booking';

function isAdmin(role?: string) {
  return role === 'admin' || role === 'super_admin';
}

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/projects/[id]/duplicate
 *
 * Duplicates a project (template or design) with its own copy of the
 * background image in R2. This prevents the bug where deleting a
 * duplicate template deletes the original template's BG file.
 *
 * Body (optional):
 *   {
 *     name?: string,           — override the duplicate's name
 *     appSource?: TemplateApp, — when duplicating to the other app
 *                                (manasik → ghadaq or vice versa)
 *     copyProductConnections?: boolean — when true AND appSource is set,
 *                                copy booking product connections from
 *                                the source template's slot to the
 *                                target app's slot
 *   }
 *
 * Flow:
 *   1. Verify auth + access
 *   2. Fetch the source project
 *   3. If it has an R2 BG URL, copy the R2 object to a new key owned
 *      by the new project ID
 *   4. Create the new project document with the new BG URL
 *   5. If copyProductConnections is true, copy booking product
 *      connections to the target app's slot
 *   6. Return the new project
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await verifySession();
    if (!session) {
      return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const { project: source, collectionName } = await findProjectById(id);
    if (!source || !collectionName) {
      return NextResponse.json({ success: false, error: 'notFound' }, { status: 404 });
    }

    // Access control: templates require admin; designs require owner or admin
    if (source.kind === 'booking_template' && !isAdmin(session.role)) {
      return NextResponse.json({ success: false, error: 'forbidden' }, { status: 403 });
    }
    if (source.kind !== 'booking_template' && source.userId !== session.id && !isAdmin(session.role)) {
      return NextResponse.json({ success: false, error: 'forbidden' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({} as Record<string, unknown>));
    const nameOverride = typeof body?.name === 'string' ? body.name : undefined;
    const targetApp = typeof body?.appSource === 'string' ? (body.appSource as TemplateApp) : undefined;
    const copyProductConnections = body?.copyProductConnections === true;

    const newId = generateId();
    const now = Date.now();

    // ── Copy the background image to a new R2 key ───────────────────
    // This is the critical fix: the duplicate gets its OWN BG file,
    // so deleting the duplicate won't affect the original template's BG.
    let newBackgroundUri = source.backgroundUri;
    let newBackgroundThumbnailUri = source.backgroundThumbnailUri;

    if (source.backgroundUri) {
      const bgUrl = source.backgroundUri;
      // Only copy if it's an R2 URL (not a data: or blob: URL)
      if (!bgUrl.startsWith('data:') && !bgUrl.startsWith('blob:')) {
        const sourceKey = extractKeyFromUrl(bgUrl);
        if (sourceKey) {
          // Derive the file extension from the source key
          const ext = sourceKey.split('.').pop() || 'jpg';
          const fakeFile = { name: `bg.${ext}`, type: 'image/jpeg' };
          const targetKey = generateBackgroundKey(newId, fakeFile);
          const copied = await copyR2Object(sourceKey, targetKey);
          if (copied) {
            newBackgroundUri = copied.url;
          }
          // If copy fails, fall back to the original URL — the duplicate
          // will share the BG, but the ownership check in
          // collectProjectR2Keys() prevents deletion from breaking the
          // original template.
        }
      }
    }

    // ── Copy the background thumbnail if it exists ──────────────────
    // Thumbnails use a stable key (design/thumbnails/{projectId}.webp),
    // so we don't need to copy — the new project will get its own
    // thumbnail when the editor captures one on save.
    // We clear it here so the duplicate doesn't reference the original's
    // thumbnail key (which would be wrong).
    newBackgroundThumbnailUri = undefined;

    // ── Build the new project ───────────────────────────────────────
    const newName = nameOverride || `${source.name} — نسخة`;

    const newProject: Project = {
      ...source,
      id: newId,
      _id: undefined,
      name: newName,
      backgroundUri: newBackgroundUri,
      backgroundThumbnailUri: newBackgroundThumbnailUri,
      // New layers with new IDs (same as the client-side duplicate logic)
      layers: source.layers.map((layer) => ({ ...layer, id: generateId() })),
      // Override appSource if duplicating to the other app
      appSource: targetApp ?? source.appSource,
      // Reset sync/timestamp metadata
      createdAt: now,
      updatedAt: now,
      localModifiedAt: now,
      syncStatus: 'synced',
      syncedAt: now,
      // Clear order-specific metadata — this is NOT an order design
      orderMeta: undefined,
      orderDesignUrl: undefined,
      // Don't inherit soft-delete flags
      isDeleted: undefined,
      deletedAt: undefined,
      // New owner
      userId: session.id,
    };
    // Remove _id so MongoDB auto-generates a new ObjectId on insert
    delete newProject._id;

    // Save to the correct collection based on kind
    const targetCollectionName = source.kind === 'booking_template'
      ? BOOKING_TEMPLATES_COLLECTION
      : DESIGN_PROJECTS_COLLECTION;
    const collection = await getProjectCollection(targetCollectionName);
    await collection.insertOne(newProject);

    // ── Copy product connections when duplicating to another app ────
    if (copyProductConnections && targetApp && source.kind === 'booking_template') {
      const sourceApp = source.appSource ?? 'manasik';
      const tplType = source.templateType ?? 'text';

      // Determine source + target slot field names
      const sourceSlot: keyof BookingProduct | null =
        sourceApp === 'ghadaq'
          ? (tplType === 'image' ? 'ghadaqImageTemplateId' : 'ghadaqTemplateId')
          : (tplType === 'image' ? 'imageTemplateId' : 'templateId');
      const targetSlot: keyof BookingProduct | null =
        targetApp === 'ghadaq'
          ? (tplType === 'image' ? 'ghadaqImageTemplateId' : 'ghadaqTemplateId')
          : (tplType === 'image' ? 'imageTemplateId' : 'templateId');

      if (sourceSlot && targetSlot && sourceSlot !== targetSlot) {
        try {
          const { getMongoClient } = await import('@/lib/db/mongodb');
          const mongoClient = getMongoClient();
          const bpCollection = mongoClient.getCollection<BookingProduct>('design_booking_products');
          if (bpCollection) {
            // Find products connected to the source template via the source slot
            const connected = await bpCollection
              .find({ [sourceSlot]: source.id } as Record<string, unknown>)
              .toArray();
            // Connect each to the new template via the target slot —
            // only if the target slot is empty
            for (const bp of connected) {
              const existing = bp[targetSlot];
              if (existing) continue; // already has a template for this slot
              await bpCollection.updateOne(
                { id: bp.id } as Record<string, unknown>,
                { $set: { [targetSlot]: newId, updatedAt: now, localModifiedAt: now } },
              );
            }
          }
        } catch (err) {
          console.error('[POST /api/projects/[id]/duplicate] Failed to copy product connections:', err);
        }
      }
    }

    return NextResponse.json(
      { success: true, data: { ...newProject, _id: undefined } },
      { status: 201 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[POST /api/projects/[id]/duplicate]', message, error);
    return NextResponse.json(
      { success: false, error: 'serverError', message },
      { status: 500 },
    );
  }
}
