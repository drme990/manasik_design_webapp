import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/lib/auth/session';
import { getMongoClient } from '@/lib/db/mongodb';
import { uploadToR2, generateFontKey } from '@/lib/storage/r2';

// Force Node.js runtime — required for @aws-sdk + Buffer
export const runtime = 'nodejs';

const COLLECTION = 'design_user_fonts';

// Allowed font MIME types and extensions
const ALLOWED_FONT_TYPES = new Set([
  'font/ttf',
  'font/otf',
  'font/woff',
  'font/woff2',
  'application/font-woff',
  'application/font-woff2',
  'application/vnd.ms-fontobject',
  'application/octet-stream', // browsers often send this for fonts
]);
const ALLOWED_FONT_EXTS = new Set(['ttf', 'otf', 'woff', 'woff2', 'eot']);
const MAX_FONT_SIZE = 15 * 1024 * 1024; // 15 MB

interface UserFontDoc {
  id: string;
  userId: string;
  family: string;
  name: string;
  url: string;
  format: string; // e.g. 'woff2', 'ttf'
  weight: number;
  contentType: string;
  size: number;
  createdAt: number;
}

async function getCollection() {
  const client = getMongoClient();
  if (!client.isConnected()) {
    await client.connect();
  }
  const collection = client.getCollection<UserFontDoc>(COLLECTION);
  if (!collection) {
    throw new Error('Fonts collection not available');
  }
  return collection;
}

// Derive a CSS font-family name from the file name.
// e.g. "My Custom Font Bold.ttf" -> "My Custom Font Bold"
// We keep spaces + unicode letters so the family name is human-readable.
function deriveFamilyName(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, '').trim();
  return base || 'Custom Font';
}

// Map extension to CSS @font-face format string
function extToFormat(ext: string): string {
  switch (ext.toLowerCase()) {
    case 'woff2': return 'woff2';
    case 'woff': return 'woff';
    case 'ttf': return 'truetype';
    case 'otf': return 'opentype';
    case 'eot': return 'embedded-opentype';
    default: return 'truetype';
  }
}

// GET — list the current user's uploaded fonts
export async function GET() {
  try {
    const session = await verifySession();
    if (!session) {
      return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
    }

    const collection = await getCollection();
    const docs = await collection.find({ userId: session.id }).toArray();
    // Strip Mongo's _id before returning
    const fonts = docs.map((doc) => {
      const rest = { ...doc };
      delete (rest as Record<string, unknown>)._id;
      return rest;
    });
    return NextResponse.json({ success: true, data: fonts });
  } catch (error) {
    console.error('[GET /api/fonts]', error);
    return NextResponse.json({ success: false, error: 'serverError' }, { status: 500 });
  }
}

// POST — upload a new font file
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

    // Validate extension (more reliable than MIME type for fonts)
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (!ALLOWED_FONT_EXTS.has(ext)) {
      return NextResponse.json({ success: false, error: 'unsupportedType' }, { status: 400 });
    }
    // Also check MIME type if the browser sent a real one
    if (file.type && !ALLOWED_FONT_TYPES.has(file.type)) {
      return NextResponse.json({ success: false, error: 'unsupportedType' }, { status: 400 });
    }

    if (file.size > MAX_FONT_SIZE) {
      return NextResponse.json({ success: false, error: 'fileTooLarge' }, { status: 400 });
    }

    const family = deriveFamilyName(file.name);
    const contentType = file.type || `font/${ext}`;
    const key = generateFontKey(file);
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await uploadToR2(key, buffer, contentType);

    const doc: UserFontDoc = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      userId: session.id,
      family,
      name: family,
      url: result.url,
      format: extToFormat(ext),
      weight: 400, // default; user can't set this yet — most uploaded fonts are regular weight
      contentType,
      size: result.size,
      createdAt: Date.now(),
    };

    const collection = await getCollection();
    await collection.insertOne(doc);

    // Strip Mongo's _id before returning (not in our type / not needed by client)
    const fontData = { ...doc } as UserFontDoc & { _id?: unknown };
    delete fontData._id;
    return NextResponse.json({ success: true, data: fontData });
  } catch (error) {
    console.error('[POST /api/fonts]', error);
    return NextResponse.json({ success: false, error: 'serverError' }, { status: 500 });
  }
}
