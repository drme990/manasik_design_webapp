import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/lib/auth/session';
import { getMongoClient } from '@/lib/db/mongodb';
import type { Project, ProjectCreateInput } from '@/types';

const COLLECTION = 'projects';

function isAdmin(role?: string) {
  return role === 'admin' || role === 'super_admin';
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

export async function GET(request: NextRequest) {
  try {
    const session = await verifySession();
    if (!session) {
      return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
    }

    // Optional ?kind= filter — e.g. /api/projects?kind=booking_template
    // Optional ?source= filter — e.g. /api/projects?source=order
    const kindFilter = request.nextUrl.searchParams.get('kind');
    const sourceFilter = request.nextUrl.searchParams.get('source');

    const collection = await getCollection();
    const query: Record<string, unknown> = { userId: session.id };
    if (kindFilter) {
      query.kind = kindFilter;
    } else {
      query.kind = { $ne: 'booking_template' };
    }
    if (sourceFilter) {
      query.source = sourceFilter;
    } else if (!kindFilter || kindFilter === 'design') {
      // By default, hide order-generated designs from the main list —
      // they're shown in a separate /orders-designs section. Only
      // exclude them when no explicit source filter is provided.
      query.source = { $ne: 'order' };
    }
    const projects = await collection
      .find(query)
      .sort({ updatedAt: -1 })
      .toArray();

    return NextResponse.json({ success: true, data: projects });
  } catch (error) {
    console.error('[GET /api/projects]', error);
    return NextResponse.json({ success: false, error: 'serverError' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await verifySession();
    if (!session) {
      return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
    }

    const body = (await request.json()) as ProjectCreateInput;
    if (body.kind === 'booking_template' && !isAdmin(session.role)) {
      return NextResponse.json({ success: false, error: 'forbidden' }, { status: 403 });
    }

    const now = Date.now();

    const project: Project = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
      name: body.name,
      kind: body.kind,
      canvasWidth: body.canvasWidth,
      canvasHeight: body.canvasHeight,
      backgroundColor: body.backgroundColor ?? '#ffffff',
      backgroundUri: body.backgroundUri,
      layers: body.layers ?? [],
      bookingMeta: body.bookingMeta,
      templateType: body.templateType,
      appSource: body.appSource,
      createdAt: now,
      updatedAt: now,
      localModifiedAt: now,
      syncStatus: 'pending',
      userId: session.id,
    };

    const collection = await getCollection();
    await collection.insertOne(project);

    return NextResponse.json({ success: true, data: project }, { status: 201 });
  } catch (error) {
    console.error('[POST /api/projects]', error);
    return NextResponse.json({ success: false, error: 'serverError' }, { status: 500 });
  }
}
