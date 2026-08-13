import { NextResponse } from 'next/server';
import { verifySession } from '@/lib/auth/session';
import { getMongoClient } from '@/lib/db/mongodb';

/**
 * GET /api/backend/products
 *
 * Returns the list of real products from the backend's `products`
 * MongoDB collection. Both the design app and the backend share the
 * same MongoDB instance, so we read directly from the backend's
 * collection — no cross-app HTTP call needed.
 *
 * The response is a simplified shape suitable for the templates page:
 *   { id, name (ar), slug, media (first image url), isActive }
 *
 * Auth: requires a valid design-app session (any logged-in user).
 */

const COLLECTION = 'products';

// Only the fields we need — keeps the response payload small.
const PROJECTION = {
  name: 1,
  slug: 1,
  media: 1,
  isActive: 1,
  isDeleted: 1,
  displayOrder: 1,
  createdAt: 1,
  sizes: 1,
};

interface BackendProductSize {
  name: { ar: string; en: string };
  isAvailable?: boolean;
}

interface BackendProduct {
  _id: unknown;
  name: { ar: string; en: string };
  slug: string;
  media?: { url: string; platform: string }[];
  isActive?: boolean;
  isDeleted?: boolean;
  displayOrder?: number;
  createdAt?: Date;
  sizes?: BackendProductSize[];
}

export async function GET() {
  try {
    const session = await verifySession();
    if (!session) {
      return NextResponse.json(
        { success: false, error: 'unauthorized' },
        { status: 401 },
      );
    }

    const client = getMongoClient();
    if (!client.isConnected()) {
      await client.connect();
    }
    const collection = client.getCollection<BackendProduct>(COLLECTION);
    if (!collection) {
      throw new Error('Products collection not available');
    }

    // Exclude soft-deleted products, sort by displayOrder then creation date
    const products = await collection
      .find({ isDeleted: { $ne: true } }, { projection: PROJECTION })
      .sort({ displayOrder: 1, createdAt: -1 })
      .limit(1000)
      .toArray();

    const data = products.map((p) => {
      const sizes = (p.sizes ?? [])
        .map((s, i) => ({
          index: i,
          name: s.name?.ar ?? s.name?.en ?? `Size ${i + 1}`,
        }))
        .filter((_, i) => p.sizes?.[i]?.isAvailable !== false);
      return {
        id: String(p._id),
        name: p.name?.ar ?? p.name?.en ?? p.slug,
        slug: p.slug,
        imageUri: p.media?.[0]?.url ?? undefined,
        isActive: p.isActive ?? true,
        // Always include at least 1 size entry (index 0) so the UI has
        // something to show even for products with no sizes array.
        sizes: sizes.length > 0 ? sizes : [{ index: 0, name: 'افتراضي' }],
      };
    });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('[GET /api/backend/products]', error);
    return NextResponse.json(
      { success: false, error: 'serverError' },
      { status: 500 },
    );
  }
}
