import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/lib/auth/session';
import { getMongoClient } from '@/lib/db/mongodb';
import type { Project, ProjectCreateInput } from '@/types';

const COLLECTION = 'projects';

function isAdmin(role?: string) {
  return role === 'admin' || role === 'super_admin';
}

/**
 * Verify a callback request from the backend (shared secret).
 * The backend uses this to proxy order-design queries from the
 * admin panel without needing a user JWT session.
 */
function verifyCallbackSecret(request: NextRequest): boolean {
  const secret = process.env.CALLBACK_SECRET;
  if (!secret) return false;
  const provided = request.headers.get('x-callback-secret');
  if (!provided) return false;
  if (provided.length !== secret.length) return false;
  return provided === secret;
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

export async function GET(request: NextRequest) {
  try {
    // Auth: accept either a user JWT session OR a callback secret
    // (for backend proxying order-design queries from the admin panel).
    const session = await verifySession();
    const isCallback = verifyCallbackSecret(request);
    if (!session && !isCallback) {
      return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
    }

    // Optional ?kind= filter — e.g. /api/projects?kind=booking_template
    // Optional ?source= filter — e.g. /api/projects?source=order
    // Optional ?page= and ?limit= for pagination (default: all)
    // Optional ?fromDate= and ?toDate= for date range filter (ISO date
    //   strings, e.g. 2026-08-14). Filters by updatedAt.
    // Optional ?search= for substring match on project name
    const kindFilter = request.nextUrl.searchParams.get('kind');
    const sourceFilter = request.nextUrl.searchParams.get('source');
    const pageParam = request.nextUrl.searchParams.get('page');
    const limitParam = request.nextUrl.searchParams.get('limit');
    const fromDate = request.nextUrl.searchParams.get('fromDate');
    const toDate = request.nextUrl.searchParams.get('toDate');
    const search = request.nextUrl.searchParams.get('search');

    // Callback secret auth can ONLY access source=order (order designs).
    // This prevents the backend from reading user-private projects.
    if (isCallback && sourceFilter !== 'order') {
      return NextResponse.json(
        { success: false, error: 'Callback secret auth requires source=order' },
        { status: 403 },
      );
    }

    // Parse pagination params (only when both are provided)
    const page = pageParam ? Math.max(1, parseInt(pageParam, 10)) : null;
    const limit = limitParam ? Math.max(1, Math.min(500, parseInt(limitParam, 10))) : null;
    const isPaginated = page !== null && limit !== null;

    const collection = await getCollection();
    const query: Record<string, unknown> = {};

    // Order-generated designs (source='order') are created by the
    // backend callback, not by a user. They inherit the template
    // creator's userId, which may be a different admin. So for
    // source=order, we DON'T filter by userId — all admins should
    // see all order designs. For other queries, we filter by userId
    // so users only see their own projects.
    if (sourceFilter === 'order') {
      query.source = 'order';
      query.kind = { $ne: 'booking_template' };
    } else {
      // Non-order queries require a user session (callback auth is
      // restricted to source=order only, checked above).
      query.userId = session!.id;
      if (kindFilter) {
        query.kind = kindFilter;
      } else {
        query.kind = { $ne: 'booking_template' };
      }
      if (sourceFilter) {
        query.source = sourceFilter;
      } else if (!kindFilter || kindFilter === 'design') {
        // By default, hide order-generated designs from the main list —
        // they're shown in a separate /orders-designs section. Only
        // exclude them when no explicit source filter is provided.
        query.source = { $ne: 'order' };
      }
    }

    // Date range filter.
    // For source=order: filter by orderMeta.executionDate (YYYY-MM-DD string)
    //   — same field the execution page uses. fromDate/toDate are ISO date
    //   strings, so we can compare them directly as strings.
    //   Legacy designs (generated before orderMeta existed) fall back to
    //   the design's createdAt timestamp, approximating the execution date
    //   as createdAt + 1 day (same legacy logic as the execution page).
    // For everything else: filter on updatedAt (ms since epoch).
    if (fromDate || toDate) {
      if (sourceFilter === 'order') {
        // Build the executionDate string filter for new designs
        const execDateFilter: Record<string, string> = {};
        if (fromDate) execDateFilter.$gte = fromDate;
        if (toDate) execDateFilter.$lte = toDate;

        // Build the createdAt ms filter for legacy designs (no orderMeta)
        const legacyDateFilter: Record<string, number> = {};
        if (fromDate) {
          // execution date ≈ createdAt + 1 day, so createdAt ≈ executionDate - 1 day
          // We want orders whose effective execution date falls in [fromDate, toDate].
          // For legacy: createdAt + 1 day in [fromDate, toDate]
          //   → createdAt in [fromDate - 1 day, toDate - 1 day]
          const fromMinus1 = new Date(fromDate + 'T00:00:00');
          fromMinus1.setDate(fromMinus1.getDate() - 1);
          legacyDateFilter.$gte = fromMinus1.getTime();
        }
        if (toDate) {
          const toMinus1 = new Date(toDate + 'T23:59:59.999');
          toMinus1.setDate(toMinus1.getDate() - 1);
          legacyDateFilter.$lte = toMinus1.getTime();
        }

        // Use $or: either orderMeta.executionDate matches (new designs)
        // or orderMeta.executionDate doesn't exist AND createdAt matches
        // the shifted range (legacy designs).
        const orClauses: Record<string, unknown>[] = [];
        if (Object.keys(execDateFilter).length > 0) {
          orClauses.push({ 'orderMeta.executionDate': execDateFilter });
        }
        if (Object.keys(legacyDateFilter).length > 0) {
          orClauses.push({
            'orderMeta.executionDate': { $exists: false },
            createdAt: legacyDateFilter,
          });
        }
        if (orClauses.length > 0) {
          // Preserve any existing $or (e.g. from other filters) — though
          // currently there isn't one, this is safe.
          if (query.$or) {
            query.$and = [{ $or: query.$or }, { $or: orClauses }];
            delete query.$or;
          } else {
            query.$or = orClauses;
          }
        }
      } else {
        const dateFilter: Record<string, number> = {};
        if (fromDate) {
          const fromMs = new Date(fromDate + 'T00:00:00').getTime();
          if (!isNaN(fromMs)) dateFilter.$gte = fromMs;
        }
        if (toDate) {
          const toMs = new Date(toDate + 'T23:59:59.999').getTime();
          if (!isNaN(toMs)) dateFilter.$lte = toMs;
        }
        if (Object.keys(dateFilter).length > 0) {
          query.updatedAt = dateFilter;
        }
      }
    }

    // Search filter — case-insensitive substring match on project name
    if (search && search.trim()) {
      query.name = { $regex: search.trim(), $options: 'i' };
    }

    // Build the cursor — sort order depends on the source:
    // - source=order: sort by orderMeta.orderCreatedAt ascending (oldest
    //   first) to match the execution page's ordering. Legacy designs
    //   without orderMeta.orderCreatedAt will sort first (MongoDB sorts
    //   missing values first in ascending order), which is correct since
    //   they're from older orders.
    // - everything else: sort by updatedAt descending (newest first)
    const sortField = sourceFilter === 'order'
      ? 'orderMeta.orderCreatedAt'
      : 'updatedAt';
    const sortDir: 1 | -1 = sourceFilter === 'order' ? 1 : -1;

    let cursor = collection
      .find(query)
      .sort({ [sortField]: sortDir })
      .allowDiskUse(true);

    // Apply pagination if requested
    if (isPaginated) {
      cursor = cursor.skip((page! - 1) * limit!).limit(limit!);
    }

    const docs = await cursor.toArray();

    // Convert MongoDB ObjectId _id to string for JSON serialization.
    const projects = docs.map((doc) => ({
      ...doc,
      _id: doc._id?.toString(),
    }));

    // If paginated, also return total count + pagination metadata
    if (isPaginated) {
      const total = await collection.countDocuments(query);
      const totalPages = Math.ceil(total / limit!);
      return NextResponse.json({
        success: true,
        data: projects,
        pagination: {
          page: page!,
          limit: limit!,
          total,
          totalPages,
          hasNext: page! < totalPages,
          hasPrev: page! > 1,
        },
      });
    }

    return NextResponse.json({ success: true, data: projects });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[GET /api/projects]', message, error);
    return NextResponse.json(
      { success: false, error: 'serverError', message },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await verifySession();
    if (!session) {
      return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
    }

    const body = (await request.json()) as ProjectCreateInput;
    if (body.kind === 'booking_template' && !isAdmin(session.role)) {
      return NextResponse.json({ success: false, error: 'forbidden' }, { status: 403 });
    }

    const now = Date.now();

    const project: Project = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
      name: body.name,
      kind: body.kind,
      canvasWidth: body.canvasWidth,
      canvasHeight: body.canvasHeight,
      backgroundColor: body.backgroundColor ?? '#ffffff',
      backgroundUri: body.backgroundUri,
      layers: body.layers ?? [],
      bookingMeta: body.bookingMeta,
      templateType: body.templateType,
      appSource: body.appSource,
      createdAt: now,
      updatedAt: now,
      localModifiedAt: now,
      syncStatus: 'pending',
      userId: session.id,
    };

    const collection = await getCollection();
    await collection.insertOne(project);

    return NextResponse.json({ success: true, data: project }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[POST /api/projects]', message, error);
    return NextResponse.json(
      { success: false, error: 'serverError', message },
      { status: 500 },
    );
  }
}
