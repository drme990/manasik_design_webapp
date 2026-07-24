import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/lib/auth/session';
import { getMongoClient } from '@/lib/db/mongodb';
import { uploadToR2, generateThumbnailKey } from '@/lib/storage/r2';
import type { Project } from '@/types';

const COLLECTION = 'projects';

function isAdmin(role?: string) {
  return role === 'admin' || role === 'super_admin';
}

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/projects/[id]/thumbnail
 * Receives a compressed WebP/JPthumbnail image (FormData) and uploads it
 * to R2 under `design/thumbnails/{projectId}.webp`. Updates the project's
 * `thumbnail` field in MongoDB with the public URL.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await verifySession();
    if (!session) {
      return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    // Verify project exists and user has access
    const client = getMongoClient();
    if (!client.isConnected()) {
      await client.connect();
    }
    const collection = client.getCollection<Project>(COLLECTION);
    if (!collection) {
      throw new Error('Projects collection not available');
    }

    const existing = await collection.findOne({ id });
    if (!existing) {
      return NextResponse.json({ success: false, error: 'notFound' }, { status: 404 });
    }
    if (existing.kind !== 'booking_template' && existing.userId !== session.id && !isAdmin(session.role)) {
      return NextResponse.json({ success: false, error: 'forbidden' }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get('thumbnail');

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ success: false, error: 'noFile' }, { status: 400 });
    }

    // Upload to R2 under the thumbnails folder
    const key = generateThumbnailKey(id);
    const buffer = Buffer.from(await file.arrayBuffer());
    const contentType = file.type || 'image/webp';
    const result = await uploadToR2(key, buffer, contentType);

    // Append a cache-busting query parameter so browsers/CDNs always fetch
    // the latest thumbnail instead of serving a cached version. The R2 key
    // is the same every time (design/thumbnails/{id}.webp), so without this
    // the URL never changes and stale images are served indefinitely.
    const thumbnailUrl = `${result.url}?v=${Date.now()}`;

    // Update the project's thumbnail field in MongoDB
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
