import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/lib/auth/session';
import { getMongoClient } from '@/lib/db/mongodb';
import type { PdfProject } from '@/types';

const COLLECTION = 'pdf_projects';

interface RouteParams {
  params: Promise<{ id: string }>;
}

async function getCollection() {
  const client = getMongoClient();
  if (!client.isConnected()) {
    await client.connect();
  }
  const collection = client.getCollection<PdfProject>(COLLECTION);
  if (!collection) {
    throw new Error('PDF projects collection not available');
  }
  return collection;
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const session = await verifySession();
    if (!session) {
      return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const collection = await getCollection();
    const project = await collection.findOne({ id });

    if (!project) {
      return NextResponse.json({ success: false, error: 'notFound' }, { status: 404 });
    }
    if (project.userId !== session.id) {
      return NextResponse.json({ success: false, error: 'forbidden' }, { status: 403 });
    }

    return NextResponse.json({ success: true, data: project });
  } catch (error) {
    console.error('[GET /api/pdf-projects/[id]]', error);
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
    const collection = await getCollection();
    const existing = await collection.findOne({ id });

    if (!existing) {
      return NextResponse.json({ success: false, error: 'notFound' }, { status: 404 });
    }
    if (existing.userId !== session.id) {
      return NextResponse.json({ success: false, error: 'forbidden' }, { status: 403 });
    }

    const body = (await request.json()) as Partial<PdfProject>;
    const { _id, id: bodyId, userId, ...safeBody } = body as Record<string, unknown>;
    const updates: Partial<PdfProject> = {
      ...(safeBody as Partial<PdfProject>),
      updatedAt: Date.now(),
      localModifiedAt: Date.now(),
    };

    await collection.updateOne({ id }, { $set: updates });
    const updated = await collection.findOne({ id });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error('[PATCH /api/pdf-projects/[id]]', error);
    return NextResponse.json({ success: false, error: 'serverError' }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const session = await verifySession();
    if (!session) {
      return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const collection = await getCollection();
    const existing = await collection.findOne({ id });

    if (!existing) {
      return NextResponse.json({ success: false, error: 'notFound' }, { status: 404 });
    }
    if (existing.userId !== session.id) {
      return NextResponse.json({ success: false, error: 'forbidden' }, { status: 403 });
    }

    await collection.deleteOne({ id });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[DELETE /api/pdf-projects/[id]]', error);
    return NextResponse.json({ success: false, error: 'serverError' }, { status: 500 });
  }
}
