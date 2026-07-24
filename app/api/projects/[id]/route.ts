import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/lib/auth/session';
import { getMongoClient } from '@/lib/db/mongodb';
import { deleteMultipleFromR2, extractKeyFromUrl, generateThumbnailKey } from '@/lib/storage/r2';
import type { Project, ProjectUpdateInput, ImageLayer, ShapeLayer } from '@/types';

const COLLECTION = 'projects';

function isAdmin(role?: string) {
  return role === 'admin' || role === 'super_admin';
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

    return NextResponse.json({ success: true, data: project });
  } catch (error) {
    console.error('[GET /api/projects/[id]]', error);
    return NextResponse.json({ success: false, error: 'serverError' }, { status: 500 });
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

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error('[PATCH /api/projects/[id]]', error);
    return NextResponse.json({ success: false, error: 'serverError' }, { status: 500 });
  }
}

/**
 * Collect all R2 URLs from a project that should be deleted when the
 * project is deleted: background, thumbnail, image layer URIs, shape URIs,
 * and collage cell URIs.
 */
function collectProjectR2Keys(project: Project): string[] {
  const keys: string[] = [];

  // Thumbnail (stored at a predictable key)
  keys.push(generateThumbnailKey(project.id));

  // Background image
  if (project.backgroundUri) {
    const key = extractKeyFromUrl(project.backgroundUri);
    if (key) keys.push(key);
  }
  if (project.backgroundThumbnailUri) {
    const key = extractKeyFromUrl(project.backgroundThumbnailUri);
    if (key) keys.push(key);
  }

  // Layer URIs
  for (const layer of project.layers) {
    if (layer.type === 'image') {
      const img = layer as ImageLayer;
      if (img.uri) {
        const key = extractKeyFromUrl(img.uri);
        if (key) keys.push(key);
      }
      if (img.originalUri) {
        const key = extractKeyFromUrl(img.originalUri);
        if (key) keys.push(key);
      }
      if (img.thumbnailUri) {
        const key = extractKeyFromUrl(img.thumbnailUri);
        if (key) keys.push(key);
      }
      // Collage cell URIs
      if (img.collage?.cells) {
        for (const cell of img.collage.cells) {
          if (cell.uri) {
            const key = extractKeyFromUrl(cell.uri);
            if (key) keys.push(key);
          }
        }
      }
    }
    if (layer.type === 'shape') {
      const shape = layer as ShapeLayer;
      if (shape.uri) {
        const key = extractKeyFromUrl(shape.uri);
        if (key) keys.push(key);
      }
      if (shape.thumbnailUri) {
        const key = extractKeyFromUrl(shape.thumbnailUri);
        if (key) keys.push(key);
      }
    }
  }

  // Deduplicate (a single image might be used multiple times)
  return [...new Set(keys)];
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
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

    // Collect all R2 keys to delete (images, thumbnail, etc.)
    const r2Keys = collectProjectR2Keys(existing);

    const collection = await getCollection();
    await collection.deleteOne({ id });

    // Delete all R2 assets in the background (best-effort, non-blocking)
    if (r2Keys.length > 0) {
      deleteMultipleFromR2(r2Keys).catch((err) => {
        console.error(`[DELETE /api/projects/[id]] R2 cleanup failed for ${id}:`, err);
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[DELETE /api/projects/[id]]', error);
    return NextResponse.json({ success: false, error: 'serverError' }, { status: 500 });
  }
}
