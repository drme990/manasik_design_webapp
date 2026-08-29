import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/lib/auth/session';
import { getMongoClient } from '@/lib/db/mongodb';
import type { BookingProduct, BookingProductUpdateInput, Project } from '@/types';

const COLLECTION = 'design_booking_products';
const PROJECTS_COLLECTION = 'design_booking_templates';

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

    return NextResponse.json({
      success: true,
      data: { ...product, _id: product._id?.toString() },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[GET /api/booking-products/[id]]', message, error);
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

    // ── Validate template type + appSource for all 4 slots ──────────
    // Each slot has a specific (type, app) combination:
    //   templateId          → (text, manasik)
    //   imageTemplateId     → (image, manasik)
    //   ghadaqTemplateId    → (text, ghadaq)
    //   ghadaqImageTemplateId → (image, ghadaq)
    const slotChecks: Array<{ field: string; expectedType: 'text' | 'image'; expectedApp: 'manasik' | 'ghadaq' }> = [
      { field: 'templateId', expectedType: 'text', expectedApp: 'manasik' },
      { field: 'imageTemplateId', expectedType: 'image', expectedApp: 'manasik' },
      { field: 'ghadaqTemplateId', expectedType: 'text', expectedApp: 'ghadaq' },
      { field: 'ghadaqImageTemplateId', expectedType: 'image', expectedApp: 'ghadaq' },
    ];
    const hasSlotUpdate = slotChecks.some((sc) => safeBody[sc.field]);
    if (hasSlotUpdate) {
      const mongoClient = getMongoClient();
      const projectsCollection = mongoClient.getCollection<Project>(PROJECTS_COLLECTION);
      if (projectsCollection) {
        for (const { field, expectedType, expectedApp } of slotChecks) {
          const value = safeBody[field];
          if (!value || typeof value !== 'string') continue;
          const tpl = await projectsCollection.findOne({ id: value });
          if (!tpl) continue;
          const tplType = tpl.templateType ?? 'text';
          const tplApp = tpl.appSource ?? 'manasik';
          if (tplType !== expectedType) {
            return NextResponse.json(
              { success: false, error: 'templateTypeMismatch', message: `Template type mismatch for ${field}.` },
              { status: 400 },
            );
          }
          if (tplApp !== expectedApp) {
            return NextResponse.json(
              { success: false, error: 'appSourceMismatch', message: `App source mismatch for ${field}.` },
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

    return NextResponse.json({
      success: true,
      data: updated ? { ...updated, _id: updated._id?.toString() } : null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[PATCH /api/booking-products/[id]]', message, error);
    return NextResponse.json(
      { success: false, error: 'serverError', message },
      { status: 500 },
    );
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
