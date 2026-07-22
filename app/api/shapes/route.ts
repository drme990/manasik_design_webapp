import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/lib/auth/session';
import { getMongoClient } from '@/lib/db/mongodb';
import { uploadToR2, generateShapeKey } from '@/lib/storage/r2';

// Force Node.js runtime — required for @aws-sdk + Buffer
export const runtime = 'nodejs';

const COLLECTION = 'design_user_shapes';

// Only PNG is allowed for custom shapes (preserves transparency)
const ALLOWED_TYPES = new Set(['image/png']);
const ALLOWED_EXTS = new Set(['png']);
const MAX_SIZE = 5 * 1024 * 1024; // 5 MB

interface UserShapeDoc {
  id: string;
  userId: string;
  name: string;
  url: string;
  thumbnailUrl?: string;
  naturalWidth: number;
  naturalHeight: number;
  contentType: string;
  size: number;
  createdAt: number;
}

async function getCollection() {
  const client = getMongoClient();
  if (!client.isConnected()) {
    await client.connect();
  }
  const collection = client.getCollection<UserShapeDoc>(COLLECTION);
  if (!collection) {
    throw new Error('Shapes collection not available');
  }
  return collection;
}

// GET — list the current user's uploaded PNG shapes
export async function GET() {
  try {
    const session = await verifySession();
    if (!session) {
      return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
    }

    const collection = await getCollection();
    const docs = await collection.find({ userId: session.id }).toArray();
    const shapes = docs.map(({ _id: _omit, ...rest }) => rest);
    return NextResponse.json({ success: true, data: shapes });
  } catch (error) {
    console.error('[GET /api/shapes]', error);
    return NextResponse.json({ success: false, error: 'serverError' }, { status: 500 });
  }
}

// POST — upload a new PNG shape
export async function POST(request: NextRequest) {
  try {
    const session = await verifySession();
    if (!session) {
      return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file');

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ success: false, error: 'noFile' }, { status: 400 });
    }

    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (!ALLOWED_EXTS.has(ext)) {
      return NextResponse.json({ success: false, error: 'unsupportedType' }, { status: 400 });
    }
    if (file.type && !ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json({ success: false, error: 'unsupportedType' }, { status: 400 });
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json({ success: false, error: 'fileTooLarge' }, { status: 400 });
    }

    const name = file.name.replace(/\.[^.]+$/, '').trim() || 'Custom Shape';
    const contentType = file.type || 'image/png';
    const key = generateShapeKey(file);
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await uploadToR2(key, buffer, contentType);

    // Read natural dimensions from the PNG buffer (PNG IHDR is at offset 16)
    let naturalWidth = 200;
    let naturalHeight = 200;
    try {
      if (buffer.length >= 24 && buffer.toString('ascii', 1, 4) === 'PNG') {
        naturalWidth = buffer.readUInt32BE(16);
        naturalHeight = buffer.readUInt32BE(20);
      }
    } catch {
      // fall back to defaults
    }

    const doc: UserShapeDoc = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      userId: session.id,
      name,
      url: result.url,
      naturalWidth,
      naturalHeight,
      contentType,
      size: result.size,
      createdAt: Date.now(),
    };

    const collection = await getCollection();
    await collection.insertOne(doc);

    const { _id: _omit, ...rest } = doc as UserShapeDoc & { _id?: unknown };
    return NextResponse.json({ success: true, data: rest });
  } catch (error) {
    console.error('[POST /api/shapes]', error);
    return NextResponse.json({ success: false, error: 'serverError' }, { status: 500 });
  }
}
