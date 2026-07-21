import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/lib/auth/session';
import { getMongoClient } from '@/lib/db/mongodb';

export const runtime = 'nodejs';

const COLLECTION = 'design_user_fonts';

interface UserFontDoc {
  id: string;
  userId: string;
  family: string;
  name: string;
  url: string;
  format: string;
  weight: number;
  contentType: string;
  size: number;
  createdAt: number;
}

/**
 * GET /api/fonts/[id]/file — serves the raw font binary with permissive CORS
 * headers. This is needed because the FontFace API requires CORS, and the R2
 * public URL may not have CORS configured.
 *
 * The font is fetched from R2 on the server side and streamed back to the
 * browser with Access-Control-Allow-Origin: *.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await verifySession();
    if (!session) {
      return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ success: false, error: 'noId' }, { status: 400 });
    }

    const client = getMongoClient();
    if (!client.isConnected()) {
      await client.connect();
    }
    const collection = client.getCollection<UserFontDoc>(COLLECTION);
    if (!collection) {
      return NextResponse.json({ success: false, error: 'serverError' }, { status: 500 });
    }

    // Only serve fonts owned by the current user
    const font = await collection.findOne({ id, userId: session.id });
    if (!font) {
      return NextResponse.json({ success: false, error: 'notFound' }, { status: 404 });
    }

    // Fetch the font binary from R2
    const response = await fetch(font.url, { cache: 'no-store' });
    if (!response.ok) {
      return NextResponse.json(
        { success: false, error: 'upstream error' },
        { status: response.status }
      );
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': font.contentType || 'font/ttf',
        'Cache-Control': 'public, max-age=86400',
        'Access-Control-Allow-Origin': '*',
        'Content-Length': buffer.length.toString(),
      },
    });
  } catch (error) {
    console.error('[GET /api/fonts/[id]/file]', error);
    return NextResponse.json(
      { success: false, error: 'serverError' },
      { status: 500 }
    );
  }
}
