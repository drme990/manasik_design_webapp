import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/lib/auth/session';
import { getMongoClient } from '@/lib/db/mongodb';
import { uploadToR2 } from '@/lib/storage/r2';
import { renderTemplateToJpg } from '@/lib/render/canvas-renderer';
import {
  createVersion,
  generateOperationId,
} from '@/lib/services/design-version-service';
import { notifyBackendOfDesignUrlUpdate } from '@/lib/services/backend-notify';
import type { Project } from '@/types';

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
 * Re-renders an order-generated design project to JPG and creates a new
 * version snapshot. Called automatically when the admin saves an order
 * design in the editor (fire-and-forget, non-blocking).
 *
 * **Body (optional)**: `{ project: Project }` — the updated project data
 * from the client. When provided, the route uses this data directly for
 * rendering instead of fetching from MongoDB (avoids read-after-write
 * race condition).
 *
 * **Reliable flow** (image uploaded before notifying backend):
 *   1. Render the project to JPG (fast — canvas rendering)
 *   2. Create version: allocate number + upload image to R2 + insert document
 *   3. Notify the backend with the new version URL
 *
 * The image is uploaded BEFORE the backend is notified, so the URL always
 * points to a valid image. The admin panel's polling sync-on-focus picks
 * up the new version within a few seconds.
 *
 * Every save creates a new version — even a single-character text change.
 * There is no hash-based skip.
 *
 * Response:
 *   200 — { success: true, data: { url, version, versionSaved } }
 *   400 — not an order design / no design URL
 *   401 — not authenticated
 *   403 — not an admin
 *   404 — project not found
 *   500 — render error
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
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

    // ── Resolve the project data ───────────────────────────────────────
    // Prefer the project data from the request body (just saved by the
    // client) to avoid any read-after-write race condition with MongoDB.
    let body: { project?: Project } | null = null;
    try {
      body = await request.json();
    } catch {
      // Body is optional — fall back to MongoDB fetch
    }

    let project: Project | null = body?.project ?? null;

    if (!project) {
      const collection = await getCollection();
      project = await collection.findOne({ id });
    }

    if (!project) {
      return NextResponse.json(
        { success: false, error: 'notFound' },
        { status: 404 },
      );
    }

    if (project.id !== id) {
      return NextResponse.json(
        { success: false, error: 'idMismatch', message: 'Project ID in body does not match URL.' },
        { status: 400 },
      );
    }

    if (project.source !== 'order') {
      return NextResponse.json(
        { success: false, error: 'notOrderDesign', message: 'Only order-generated designs can be re-rendered.' },
        { status: 400 },
      );
    }

    // Determine the mutable R2 key (for backward-compat overwrite)
    let mutableKey: string | null = null;
    if (project.orderDesignUrl) {
      mutableKey = extractKeyFromUrl(project.orderDesignUrl);
    }

    const meta = project.orderMeta;
    if (!meta?.orderNumber || !meta?.productId) {
      // No order meta — can't create a version. Just re-render to the
      // mutable key (backward compat) and return.
      if (mutableKey) {
        const jpgBuffer = await renderTemplateToJpg(project, {});
        await uploadToR2(mutableKey, jpgBuffer, 'image/jpeg', {
          cacheControl: 'no-cache',
        });
      }
      return NextResponse.json({
        success: true,
        data: { url: project.orderDesignUrl, version: undefined, versionSaved: false },
      });
    }

    // ── 1. Render the project to JPG ───────────────────────────────────
    // This is the NEW design (with the admin's edits). The project data
    // comes from the request body (just saved by the client), so there's
    // no race condition with MongoDB.
    const jpgBuffer = await renderTemplateToJpg(project, {});

    // ── 2. Create the version (allocate + upload + insert) ─────────────
    // The image is uploaded to R2 BEFORE the version document is inserted
    // and BEFORE the backend is notified. This ensures the URL always
    // points to a valid image — no broken images in the admin panel.
    //
    // NO skipIfUnchanged — every save creates a new version, even a
    // single-character text change.
    const identity = {
      orderNumber: meta.orderNumber,
      productId: meta.productId,
      itemIndex: meta.itemIndex,
    };

    let versionResult;
    try {
      versionResult = await createVersion({
        ...identity,
        projectId: project.id,
        jpgBuffer,
        project,
        trigger: 'admin_edit',
        actor: {
          userId: session.id,
          userName: session.name || session.email,
          userRole: session.role,
        },
        operationId: generateOperationId(),
        // NO skipIfUnchanged — every save creates a new version.
      });
    } catch  {
      // Version creation failed — but the render succeeded. Fall back to
      // overwriting the mutable key so the admin at least sees the new
      // design, even without a version snapshot.
      if (mutableKey) {
        await uploadToR2(mutableKey, jpgBuffer, 'image/jpeg', {
          cacheControl: 'no-cache',
        });
      }
      return NextResponse.json({
        success: true,
        data: { url: project.orderDesignUrl, version: undefined, versionSaved: false },
      });
    }

    // ── 3. Notify the backend with the new version URL ─────────────────
    // The image is already uploaded, so the URL is valid. The backend
    // updates the order's designUrls[].url to the new archived URL.
    if (versionResult?.saved && versionResult.version?.archivedUrl) {
      await notifyBackendOfDesignUrlUpdate({
        orderNumber: meta.orderNumber,
        productId: meta.productId,
        itemIndex: meta.itemIndex,
        url: versionResult.version.archivedUrl,
        version: versionResult.version.version,
      });
    } else if (versionResult?.reason === 'duplicate_operation' && versionResult.version?.archivedUrl) {
      // Duplicate operation — the version already exists. Make sure the
      // backend's order URL points to it (safety net for lost notifications).
      await notifyBackendOfDesignUrlUpdate({
        orderNumber: meta.orderNumber,
        productId: meta.productId,
        itemIndex: meta.itemIndex,
        url: versionResult.version.archivedUrl,
        version: versionResult.version.version,
      });
    }

    // ── Also overwrite the mutable key (backward compat) ───────────────
    // Some older code might still reference the mutable URL. Overwrite it
    // with the new design so those references stay current. Best-effort.
    if (mutableKey) {
      try {
        await uploadToR2(mutableKey, jpgBuffer, 'image/jpeg', {
          cacheControl: 'no-cache',
        });
      } catch {
        // Best-effort — the archived URL is the primary URL now
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        url: versionResult?.version?.archivedUrl || project.orderDesignUrl,
        version: versionResult?.version?.version,
        versionSaved: versionResult?.saved,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'serverError';
    return NextResponse.json(
      { success: false, error: 'serverError', message },
      { status: 500 },
    );
  }
}
