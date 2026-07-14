import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/lib/auth/session';
import { getMongoClient } from '@/lib/db/mongodb';
import type { Project, ProjectUpdateInput } from '@/types';

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
    const { _id, id: bodyId, userId, ...safeBody } = body as Record<string, unknown>;
    const updates: Partial<Project> = {
      ...(safeBody as ProjectUpdateInput),
      updatedAt: Date.now(),
      localModifiedAt: Date.now(),
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

    const collection = await getCollection();
    await collection.deleteOne({ id });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[DELETE /api/projects/[id]]', error);
    return NextResponse.json({ success: false, error: 'serverError' }, { status: 500 });
  }
}
