import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/lib/auth/session';
import { getMongoClient } from '@/lib/db/mongodb';
import type { PdfProject, PdfProjectCreateInput } from '@/types';

const COLLECTION = 'pdf_projects';

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

export async function GET() {
  try {
    const session = await verifySession();
    if (!session) {
      return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
    }

    const collection = await getCollection();
    const projects = await collection
      .find({ userId: session.id })
      .sort({ updatedAt: -1 })
      .toArray();

    return NextResponse.json({ success: true, data: projects });
  } catch (error) {
    console.error('[GET /api/pdf-projects]', error);
    return NextResponse.json({ success: false, error: 'serverError' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await verifySession();
    if (!session) {
      return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
    }

    const body = (await request.json()) as PdfProjectCreateInput;
    const now = Date.now();

    const project: PdfProject = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
      name: body.name,
      images: body.images,
      createdAt: now,
      updatedAt: now,
      localModifiedAt: now,
      syncStatus: 'synced',
      syncedAt: now,
      userId: session.id,
    };

    const collection = await getCollection();
    await collection.insertOne(project);

    return NextResponse.json({ success: true, data: project }, { status: 201 });
  } catch (error) {
    console.error('[POST /api/pdf-projects]', error);
    return NextResponse.json({ success: false, error: 'serverError' }, { status: 500 });
  }
}
