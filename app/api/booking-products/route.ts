import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/lib/auth/session';
import { getMongoClient } from '@/lib/db/mongodb';
import type { BookingProduct, BookingProductCreateInput, Project } from '@/types';

const COLLECTION = 'booking_products';
const PROJECTS_COLLECTION = 'projects';

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
      backendProductId: body.backendProductId,
      sizeIndex: body.sizeIndex ?? 0,
      sizeName: body.sizeName,
      backendSlug: body.backendSlug,
      name: body.name,
      imageUri: body.imageUri,
      defaultCanvas: body.defaultCanvas,
      templateId: null,
      imageTemplateId: null,
      ghadaqTemplateId: null,
      ghadaqImageTemplateId: null,
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

/**
 * Bulk update — applies many template-slot changes in a single request.
 *
 * Request body:
 * {
 *   slotKey: 'templateId' | 'imageTemplateId',
 *   changes: [
 *     {
 *       bookingProductId?: string,   // existing product to update
 *       backendProductId?: string,   // new product to create (if no bookingProductId)
 *       backendSlug?: string,
 *       name?: string,
 *       imageUri?: string,
 *       value: string | null         // new slot value (templateId or null to unassign)
 *     }
 *   ]
 * }
 *
 * Response:
 * { success: true, data: BookingProduct[] }  — all affected products
 */
interface BulkChange {
  bookingProductId?: string;
  backendProductId?: string;
  sizeIndex?: number;
  sizeName?: string;
  backendSlug?: string;
  name?: string;
  imageUri?: string;
  value: string | null;
}

interface BulkUpdateBody {
  slotKey: 'templateId' | 'imageTemplateId' | 'ghadaqTemplateId' | 'ghadaqImageTemplateId';
  changes: BulkChange[];
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await verifySession();
    if (!session) {
      return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
    }
    if (!isAdmin(session.role)) {
      return NextResponse.json({ success: false, error: 'forbidden' }, { status: 403 });
    }

    const body = (await request.json()) as BulkUpdateBody;
    if (!body.changes || !Array.isArray(body.changes) || body.changes.length === 0) {
      return NextResponse.json({ success: false, error: 'noChanges' }, { status: 400 });
    }

    const slotKey = body.slotKey;
    const validSlots = ['templateId', 'imageTemplateId', 'ghadaqTemplateId', 'ghadaqImageTemplateId'];
    if (!validSlots.includes(slotKey)) {
      return NextResponse.json({ success: false, error: 'invalidSlotKey' }, { status: 400 });
    }

    const collection = await getCollection();
    const mongoClient = getMongoClient();
    const projectsCollection = mongoClient.getCollection<Project>(PROJECTS_COLLECTION);

    // ── Validate template type + appSource for all non-null values ──
    if (projectsCollection) {
      const templateIds = new Set<string>();
      for (const change of body.changes) {
        if (change.value && typeof change.value === 'string') {
          templateIds.add(change.value);
        }
      }
      // Check each unique template ID once
      for (const tplId of templateIds) {
        const tpl = await projectsCollection.findOne({ id: tplId });
        if (!tpl) continue;
        const tplType = tpl.templateType ?? 'text';
        const tplApp = tpl.appSource ?? 'manasik';

        // Check templateType matches the slot's type
        const slotIsImage = slotKey === 'imageTemplateId' || slotKey === 'ghadaqImageTemplateId';
        if (slotIsImage && tplType === 'text') {
          return NextResponse.json(
            { success: false, error: 'templateTypeMismatch', message: 'A text template cannot be assigned to an image template slot.' },
            { status: 400 },
          );
        }
        if (!slotIsImage && tplType === 'image') {
          return NextResponse.json(
            { success: false, error: 'templateTypeMismatch', message: 'An image template cannot be assigned to a text template slot.' },
            { status: 400 },
          );
        }

        // Check appSource matches the slot's app
        const slotIsGhadaq = slotKey === 'ghadaqTemplateId' || slotKey === 'ghadaqImageTemplateId';
        if (slotIsGhadaq && tplApp !== 'ghadaq') {
          return NextResponse.json(
            { success: false, error: 'appSourceMismatch', message: 'A Manasik template cannot be assigned to a Ghadaq slot.' },
            { status: 400 },
          );
        }
        if (!slotIsGhadaq && tplApp === 'ghadaq') {
          return NextResponse.json(
            { success: false, error: 'appSourceMismatch', message: 'A Ghadaq template cannot be assigned to a Manasik slot.' },
            { status: 400 },
          );
        }
      }
    }

    const now = Date.now();
    const results: BookingProduct[] = [];

    for (const change of body.changes) {
      if (change.bookingProductId) {
        // ── Update existing product ─────────────────────────────────
        const existing = await collection.findOne({ id: change.bookingProductId });
        if (!existing) continue; // skip missing

        const updates: Partial<BookingProduct> = {
          [slotKey]: change.value,
          updatedAt: now,
          localModifiedAt: now,
        };
        await collection.updateOne({ id: change.bookingProductId }, { $set: updates });
        const updated = await collection.findOne({ id: change.bookingProductId });
        if (updated) results.push(updated);
      } else if (change.backendProductId) {
        // ── Create new product then set slot ────────────────────────
        // Check if one already exists for this (backend product, size) pair
        const sz = change.sizeIndex ?? 0;
        const existing = await collection.findOne({
          backendProductId: change.backendProductId,
          sizeIndex: sz,
        });
        if (existing) {
          const updates: Partial<BookingProduct> = {
            [slotKey]: change.value,
            updatedAt: now,
            localModifiedAt: now,
          };
          await collection.updateOne({ id: existing.id }, { $set: updates });
          const updated = await collection.findOne({ id: existing.id });
          if (updated) results.push(updated);
        } else {
          const product: BookingProduct = {
            id: `${now}-${Math.random().toString(36).slice(2, 11)}`,
            backendProductId: change.backendProductId,
            sizeIndex: sz,
            sizeName: change.sizeName,
            backendSlug: change.backendSlug,
            name: change.name || change.backendProductId,
            imageUri: change.imageUri,
            defaultCanvas: { width: 1080, height: 1080 },
            templateId: slotKey === 'templateId' ? change.value : null,
            imageTemplateId: slotKey === 'imageTemplateId' ? change.value : null,
            ghadaqTemplateId: slotKey === 'ghadaqTemplateId' ? change.value : null,
            ghadaqImageTemplateId: slotKey === 'ghadaqImageTemplateId' ? change.value : null,
            createdAt: now,
            updatedAt: now,
            localModifiedAt: now,
            syncStatus: 'synced',
            syncedAt: now,
          };
          await collection.insertOne(product);
          results.push(product);
        }
      }
    }

    return NextResponse.json({ success: true, data: results });
  } catch (error) {
    console.error('[PATCH /api/booking-products (bulk)]', error);
    return NextResponse.json({ success: false, error: 'serverError' }, { status: 500 });
  }
}
