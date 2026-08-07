import { NextResponse } from 'next/server';
import { verifySession } from '@/lib/auth/session';

/**
 * GET /api/auth/me — returns the current logged-in user's data.
 * Used by the client-side UserMenu component to display the user's
 * name and email without a full page reload.
 */
export async function GET() {
  const session = await verifySession();
  if (!session) {
    return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
  }
  return NextResponse.json({
    success: true,
    data: {
      id: session.id,
      name: session.name,
      email: session.email,
      role: session.role,
    },
  });
}
