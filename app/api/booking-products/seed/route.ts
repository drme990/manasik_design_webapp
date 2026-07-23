import { NextResponse } from 'next/server';
import { verifySession } from '@/lib/auth/session';

/**
 * POST /api/booking-products/seed
 *
 * Previously seeded default booking products. Now that templates are
 * linked to real backend products, seeding is no longer needed — the
 * templates page loads products from the backend's `products`
 * collection directly. This endpoint is kept for backward
 * compatibility but is a no-op.
 */
export async function POST() {
  try {
    const session = await verifySession();
    if (!session) {
      return NextResponse.json(
        { success: false, error: 'unauthorized' },
        { status: 401 },
      );
    }

    return NextResponse.json({
      success: true,
      data: { seeded: false, reason: 'deprecated' },
    });
  } catch (error) {
    console.error('[POST /api/booking-products/seed]', error);
    return NextResponse.json(
      { success: false, error: 'serverError' },
      { status: 500 },
    );
  }
}
