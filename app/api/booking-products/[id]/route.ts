import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/lib/auth/session';
import { getMongoClient } from '@/lib/db/mongodb';
import type { BookingProduct, BookingProductUpdateInput, Project } from '@/types';

const COLLECTION = 'booking_products';
const PROJECTS_COLLECTION = 'projects';

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
  const collection = client.getCollection<BookingProduct>(COLLECTION);
  if (!collection) {
    throw new Error('Booking products collection not available');
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
    const product = await collection.findOne({ id });

    if (!product) {
      return NextResponse.json({ success: false, error: 'notFound' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: product });
  } catch (error) {
    console.error('[GET /api/booking-products/[id]]', error);
    return NextResponse.json({ success: false, error: 'serverError' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await verifySession();
    if (!session) {
      return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
    }
    if (!isAdmin(session.role)) {
      return NextResponse.json({ success: false, error: 'forbidden' }, { status: 403 });
    }

    const { id } = await params;
    const collection = await getCollection();
    const existing = await collection.findOne({ id });
    if (!existing) {
      return NextResponse.json({ success: false, error: 'notFound' }, { status: 404 });
    }

    const body = (await request.json()) as BookingProductUpdateInput;
    // Strip fields that must never be overwritten by a client update
    const safeBody = { ...body } as Record<string, unknown>;
    delete safeBody._id;
    delete safeBody.id;
    delete safeBody.userId;

    // ── Validate template type matches the slot ──────────────────────
    // A text template (templateType='text' or undefined) can only go in
    // `templateId`. An image template (templateType='image') can only go
    // in `imageTemplateId`. This prevents assigning 2 text templates or
    // 2 image templates to the same product.
    if (safeBody.templateId || safeBody.imageTemplateId) {
      const mongoClient = getMongoClient();
      const projectsCollection = mongoClient.getCollection<Project>(PROJECTS_COLLECTION);
      if (projectsCollection) {
        // Check templateId slot — must be a text template
        if (safeBody.templateId && typeof safeBody.templateId === 'string') {
          const tpl = await projectsCollection.findOne({ id: safeBody.templateId });
          if (tpl && tpl.templateType === 'image') {
            return NextResponse.json(
              { success: false, error: 'templateTypeMismatch', message: 'An image template cannot be assigned to the text template slot.' },
              { status: 400 },
            );
          }
        }
        // Check imageTemplateId slot — must be an image template
        if (safeBody.imageTemplateId && typeof safeBody.imageTemplateId === 'string') {
          const tpl = await projectsCollection.findOne({ id: safeBody.imageTemplateId });
          if (tpl && (tpl.templateType ?? 'text') === 'text') {
            return NextResponse.json(
              { success: false, error: 'templateTypeMismatch', message: 'A text template cannot be assigned to the image template slot.' },
              { status: 400 },
            );
          }
        }
      }
    }

    const updates: Partial<BookingProduct> = {
      ...(safeBody as BookingProductUpdateInput),
      updatedAt: Date.now(),
      localModifiedAt: Date.now(),
    };

    await collection.updateOne({ id }, { $set: updates });
    const updated = await collection.findOne({ id });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error('[PATCH /api/booking-products/[id]]', error);
    return NextResponse.json({ success: false, error: 'serverError' }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const session = await verifySession();
    if (!session) {
      return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
    }
    if (!isAdmin(session.role)) {
      return NextResponse.json({ success: false, error: 'forbidden' }, { status: 403 });
    }

    const { id } = await params;
    const collection = await getCollection();
    const existing = await collection.findOne({ id });
    if (!existing) {
      return NextResponse.json({ success: false, error: 'notFound' }, { status: 404 });
    }

    await collection.deleteOne({ id });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[DELETE /api/booking-products/[id]]', error);
    return NextResponse.json({ success: false, error: 'serverError' }, { status: 500 });
  }
}
