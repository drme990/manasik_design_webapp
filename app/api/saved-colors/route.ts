import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/lib/auth/session';
import { getMongoClient } from '@/lib/db/mongodb';

const COLLECTION = 'design_saved_colors';

interface SavedColorDoc {
  userId: string;
  colors: string[];
  updatedAt: number;
}

async function getCollection() {
  const client = getMongoClient();
  if (!client.isConnected()) {
    await client.connect();
  }
  const collection = client.getCollection<SavedColorDoc>(COLLECTION);
  if (!collection) {
    throw new Error('Saved colors collection not available');
  }
  return collection;
}

// GET — retrieve the user's saved colors
export async function GET() {
  try {
    const session = await verifySession();
    if (!session) {
      return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
    }

    const collection = await getCollection();
    const doc = await collection.findOne({ userId: session.id });

    return NextResponse.json({ success: true, data: doc?.colors ?? [] });
  } catch (error) {
    console.error('[GET /api/saved-colors]', error);
    return NextResponse.json({ success: false, error: 'serverError' }, { status: 500 });
  }
}

// POST — replace the user's entire saved colors list
export async function POST(request: NextRequest) {
  try {
    const session = await verifySession();
    if (!session) {
      return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
    }

    const { colors } = (await request.json()) as { colors: string[] };
    if (!Array.isArray(colors)) {
      return NextResponse.json({ success: false, error: 'invalidInput' }, { status: 400 });
    }

    const sanitized = colors
      .filter((c) => typeof c === 'string' && /^#[0-9A-Fa-f]{6}$/.test(c))
      .slice(0, 50);

    const collection = await getCollection();
    await collection.updateOne(
      { userId: session.id },
      {
        $set: {
          userId: session.id,
          colors: sanitized,
          updatedAt: Date.now(),
        },
      },
      { upsert: true }
    );

    return NextResponse.json({ success: true, data: sanitized });
  } catch (error) {
    console.error('[POST /api/saved-colors]', error);
    return NextResponse.json({ success: false, error: 'serverError' }, { status: 500 });
  }
}

// DELETE — remove a single color from the user's saved colors
export async function DELETE(request: NextRequest) {
  try {
    const session = await verifySession();
    if (!session) {
      return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
    }

    const { color } = (await request.json()) as { color: string };
    if (typeof color !== 'string') {
      return NextResponse.json({ success: false, error: 'invalidInput' }, { status: 400 });
    }

    const collection = await getCollection();
    const doc = await collection.findOne({ userId: session.id });
    const currentColors = doc?.colors ?? [];
    const updatedColors = currentColors.filter((c) => c.toLowerCase() !== color.toLowerCase());

    await collection.updateOne(
      { userId: session.id },
      {
        $set: {
          userId: session.id,
          colors: updatedColors,
          updatedAt: Date.now(),
        },
      },
      { upsert: true }
    );

    return NextResponse.json({ success: true, data: updatedColors });
  } catch (error) {
    console.error('[DELETE /api/saved-colors]', error);
    return NextResponse.json({ success: false, error: 'serverError' }, { status: 500 });
  }
}
