import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/lib/auth/session';
import { findProjectById, getProjectCollection } from '@/lib/db/project-collections';
import { uploadToR2, deleteFromR2, generateThumbnailKey } from '@/lib/storage/r2';

function isAdmin(role?: string) {
  return role === 'admin' || role === 'super_admin';
}

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/projects/[id]/thumbnail
 * Receives a compressed WebP/JPEG thumbnail image (FormData) and uploads it
 * to R2 under `design/thumbnails/{projectId}.webp`. Updates the project's
 * `thumbnail` field in MongoDB with the public URL.
 *
 * Uses the explicit delete + re-add flow (Tier 2 mutable asset):
 *   1. Delete the old thumbnail at the same key (best-effort — ignore
 *      "not found" errors on first upload)
 *   2. Upload the new thumbnail to the same key
 *   3. Update the DB with the new URL + cache-bust param
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await verifySession();
    if (!session) {
      return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    // Find the project across both collections (designs + templates)
    const { project: existing, collectionName } = await findProjectById(id);
    if (!existing || !collectionName) {
      return NextResponse.json({ success: false, error: 'notFound' }, { status: 404 });
    }

    // Access control: templates require admin; designs require owner or admin
    const isTemplate = existing.kind === 'booking_template';
    const canAccess = isTemplate
      ? isAdmin(session.role)
      : existing.userId === session.id || isAdmin(session.role);
    if (!canAccess) {
      return NextResponse.json({ success: false, error: 'forbidden' }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get('thumbnail');

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ success: false, error: 'noFile' }, { status: 400 });
    }

    // Tier 2 — explicit delete + re-add with the same key
    const key = generateThumbnailKey(id);
    const buffer = Buffer.from(await file.arrayBuffer());
    const contentType = file.type || 'image/webp';

    // 1. Delete old thumbnail (best-effort — ignore "not found")
    try {
      await deleteFromR2(key);
    } catch {
      // Object doesn't exist yet (first upload) — fine
    }

    // 2. Upload new thumbnail to the same key
    const result = await uploadToR2(key, buffer, contentType, {
      cacheControl: 'public, max-age=31536000, immutable',
    });

    // 3. Update DB with cache-bust param
    const thumbnailUrl = `${result.url}?v=${Date.now()}`;

    const collection = await getProjectCollection(collectionName);
    await collection.updateOne(
      { id },
      { $set: { thumbnail: thumbnailUrl, updatedAt: Date.now() } }
    );

    return NextResponse.json({ success: true, data: { thumbnail: thumbnailUrl } });
  } catch (error) {
    console.error('[POST /api/projects/[id]/thumbnail]', error);
    return NextResponse.json({ success: false, error: 'serverError' }, { status: 500 });
  }
}
