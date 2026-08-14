import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/lib/auth/session';
import { getMongoClient } from '@/lib/db/mongodb';
import type { Project, ProjectCreateInput } from '@/types';

const COLLECTION = 'projects';

function isAdmin(role?: string) {
  return role === 'admin' || role === 'super_admin';
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
    const session = await verifySession();
    if (!session) {
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
      query.userId = session.id;
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

    // Date range filter on updatedAt (timestamps are ms since epoch).
    // fromDate/toDate are ISO date strings (YYYY-MM-DD). We convert
    // to ms timestamps: fromDate → start of day, toDate → end of day.
    if (fromDate || toDate) {
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

    // Search filter — case-insensitive substring match on project name
    if (search && search.trim()) {
      query.name = { $regex: search.trim(), $options: 'i' };
    }

    // Build the cursor — always sort by updatedAt desc + allow disk use
    let cursor = collection
      .find(query)
      .sort({ updatedAt: -1 })
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
