import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/lib/auth/session';
import { uploadToR2, generateImageKey, generateBackgroundKey } from '@/lib/storage/r2';

// Force Node.js runtime — required for @aws-sdk + Buffer
export const runtime = 'nodejs';

const ALLOWED_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
];

const MAX_SIZE = 25 * 1024 * 1024; // 25 MB

export async function POST(request: NextRequest) {
  try {
    const session = await verifySession();
    if (!session) {
      return NextResponse.json(
        { success: false, error: 'unauthorized' },
        { status: 401 }
      );
    }

    const formData = await request.formData();
    const file = formData.get('file');
    const { searchParams } = new URL(request.url);

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { success: false, error: 'noFile' },
        { status: 400 }
      );
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { success: false, error: 'unsupportedType' },
        { status: 400 }
      );
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { success: false, error: 'fileTooLarge' },
        { status: 400 }
      );
    }

    // Background images use a dedicated prefix (`design/template-bg/`)
    // so they're clearly identifiable and not accidentally deleted when
    // a design instance (which shares the template's bg URL) is deleted.
    // The client passes `?type=background&projectId=xxx` for bg uploads.
    const uploadType = searchParams.get('type');
    const projectId = searchParams.get('projectId');
    const key =
      uploadType === 'background' && projectId
        ? generateBackgroundKey(projectId, file)
        : generateImageKey(file);
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await uploadToR2(key, buffer, file.type || 'application/octet-stream');

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error('[POST /api/upload]', error);
    return NextResponse.json(
      { success: false, error: 'serverError' },
      { status: 500 }
    );
  }
}
