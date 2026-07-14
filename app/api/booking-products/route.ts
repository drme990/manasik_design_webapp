import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/lib/auth/session';
import { getMongoClient } from '@/lib/db/mongodb';
import type { BookingProduct, BookingProductCreateInput } from '@/types';

const COLLECTION = 'booking_products';

function isAdmin(role?: string) {
  return role === 'admin' || role === 'super_admin';
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

export async function GET() {
  try {
    const session = await verifySession();
    if (!session) {
      return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
    }

    const collection = await getCollection();
    const products = await collection.find({}).sort({ updatedAt: -1 }).toArray();

    return NextResponse.json({ success: true, data: products });
  } catch (error) {
    console.error('[GET /api/booking-products]', error);
    return NextResponse.json({ success: false, error: 'serverError' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await verifySession();
    if (!session) {
      return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
    }
    if (!isAdmin(session.role)) {
      return NextResponse.json({ success: false, error: 'forbidden' }, { status: 403 });
    }

    const body = (await request.json()) as BookingProductCreateInput;
    const now = Date.now();

    const product: BookingProduct = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
      name: body.name,
      imageUri: body.imageUri,
      defaultCanvas: body.defaultCanvas,
      templates: {
        withImage: { single: null, double: null, multiple: null },
        withoutImage: { single: null, double: null, multiple: null },
      },
      createdAt: now,
      updatedAt: now,
      localModifiedAt: now,
      syncStatus: 'synced',
      syncedAt: now,
    };

    const collection = await getCollection();
    await collection.insertOne(product);

    return NextResponse.json({ success: true, data: product }, { status: 201 });
  } catch (error) {
    console.error('[POST /api/booking-products]', error);
    return NextResponse.json({ success: false, error: 'serverError' }, { status: 500 });
  }
}
