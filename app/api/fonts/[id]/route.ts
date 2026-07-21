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

// DELETE /api/fonts/[id] — delete a user's font by id
export async function DELETE(
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

        const collection = await getCollection();
        // Only delete if it belongs to the current user
        const result = await collection.deleteOne({ id, userId: session.id });

        if (result.deletedCount === 0) {
            return NextResponse.json({ success: false, error: 'notFound' }, { status: 404 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('[DELETE /api/fonts/[id]]', error);
        return NextResponse.json({ success: false, error: 'serverError' }, { status: 500 });
    }
}
