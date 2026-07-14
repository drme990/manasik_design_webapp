import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/lib/auth/session';
import { getMongoClient } from '@/lib/db/mongodb';
import type { BookingProduct, BookingProductUpdateInput } from '@/types';

const COLLECTION = 'booking_products';

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
    const { _id, id: bodyId, ...safeBody } = body as Record<string, unknown>;
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
