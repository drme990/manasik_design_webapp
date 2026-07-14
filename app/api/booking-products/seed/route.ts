import { NextResponse } from 'next/server';
import { verifySession } from '@/lib/auth/session';
import { getMongoClient } from '@/lib/db/mongodb';
import type { BookingProduct } from '@/types';

const COLLECTION = 'booking_products';

const DEFAULT_PRODUCTS = [
  {
    name: 'خروف عقيقة بالطعام',
    defaultCanvas: { width: 1080, height: 1080 },
  },
  {
    name: 'خروف كبير عقيقة بالطعام',
    defaultCanvas: { width: 1080, height: 1080 },
  },
  {
    name: 'كبش عقيقة بالطعام',
    defaultCanvas: { width: 1080, height: 1080 },
  },
];

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

export async function POST() {
  try {
    const session = await verifySession();
    if (!session) {
      return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
    }

    const collection = await getCollection();
    const count = await collection.countDocuments();
    if (count > 0) {
      return NextResponse.json({ success: true, data: { seeded: false, reason: 'alreadyExists' } });
    }

    const now = Date.now();
    const products: BookingProduct[] = DEFAULT_PRODUCTS.map((data) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
      name: data.name,
      defaultCanvas: data.defaultCanvas,
      templates: {
        withImage: { single: null, double: null, multiple: null },
        withoutImage: { single: null, double: null, multiple: null },
      },
      createdAt: now,
      updatedAt: now,
      localModifiedAt: now,
      syncStatus: 'synced' as const,
      syncedAt: now,
    }));

    await collection.insertMany(products);

    return NextResponse.json({ success: true, data: { seeded: true, count: products.length } });
  } catch (error) {
    console.error('[POST /api/booking-products/seed]', error);
    return NextResponse.json({ success: false, error: 'serverError' }, { status: 500 });
  }
}
