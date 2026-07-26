import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/lib/auth/session';
import { getMongoClient } from '@/lib/db/mongodb';
import { uploadToR2 } from '@/lib/storage/r2';
import { renderTemplateToJpg } from '@/lib/render/template-renderer';
import type { Project } from '@/types';

// Puppeteer rendering can take time — allow up to 60s on Vercel
export const maxDuration = 60;

const COLLECTION = 'projects';

function isAdmin(role?: string) {
  return role === 'admin' || role === 'super_admin';
}

interface RouteParams {
  params: Promise<{ id: string }>;
}

async function getCollection() {
  const client = getMongoClient();
  if (!client.isConnected()) {
    await client.connect();
  }
  const collection = client.getCollection<Project>(COLLECTION);
  if (!collection) {
    throw new Error('Projects collection not available');
  }
  return collection;
}

/**
 * Extract the R2 key from a public R2 URL.
 * e.g. https://cdn.manasik.net/design/orders-design/ORD-123.jpg
 *      → design/orders-design/ORD-123.jpg
 */
function extractKeyFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.pathname.slice(1); // remove leading /
  } catch {
    return null;
  }
}

/**
 * POST /api/projects/[id]/re-render
 *
 * Re-renders an order-generated design project to JPG and uploads it to
 * R2, overwriting the previous image at the same key. This is called
 * automatically when the admin saves an order design in the editor —
 * so the updated design replaces the old one without changing the
 * filename or the URL stored on the backend's order.
 *
 * Only works for projects with `source: 'order'` (order-generated
 * designs). Regular user designs and templates are rejected.
 *
 * Requires admin role (order designs are admin-managed).
 *
 * Response:
 *   200 — { success: true, data: { url, key } }
 *   400 — not an order design (source !== 'order')
 *   401 — not authenticated
 *   403 — not an admin
 *   404 — project not found
 *   500 — render/upload error
 */
export async function POST(_request: NextRequest, { params }: RouteParams) {
  try {
    const session = await verifySession();
    if (!session) {
      return NextResponse.json(
        { success: false, error: 'unauthorized' },
        { status: 401 },
      );
    }

    if (!isAdmin(session.role)) {
      return NextResponse.json(
        { success: false, error: 'forbidden' },
        { status: 403 },
      );
    }

    const { id } = await params;
    const collection = await getCollection();
    const project = await collection.findOne({ id });

    if (!project) {
      return NextResponse.json(
        { success: false, error: 'notFound' },
        { status: 404 },
      );
    }

    // Only order-generated designs can be re-rendered
    if (project.source !== 'order') {
      return NextResponse.json(
        { success: false, error: 'notOrderDesign', message: 'Only order-generated designs can be re-rendered.' },
        { status: 400 },
      );
    }

    // Determine the R2 key — extract it from the stored URL so we
    // overwrite the exact same file (same URL, same filename).
    let key: string | null = null;
    if (project.orderDesignUrl) {
      key = extractKeyFromUrl(project.orderDesignUrl);
    }

    if (!key) {
      return NextResponse.json(
        { success: false, error: 'noDesignUrl', message: 'This design has no stored R2 URL to overwrite.' },
        { status: 400 },
      );
    }

    // Re-render the project to JPG
    const jpgBuffer = await renderTemplateToJpg(project, {});

    // Upload to R2 at the same key (overwrites the old image)
    // Use no-cache since we're overwriting an existing key — without
    // this, Cloudflare CDN serves the stale cached version.
    const result = await uploadToR2(key, jpgBuffer, 'image/jpeg', {
      cacheControl: 'no-cache',
    });

    return NextResponse.json({
      success: true,
      data: {
        url: result.url,
        key: result.key,
      },
    });
  } catch (error) {
    console.error('[POST /api/projects/[id]/re-render]', error);
    const message = error instanceof Error ? error.message : 'serverError';
    return NextResponse.json(
      { success: false, error: 'serverError', message },
      { status: 500 },
    );
  }
}
