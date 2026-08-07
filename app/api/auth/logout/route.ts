import { NextResponse } from 'next/server';
import { destroySession } from '@/lib/auth/session';

/**
 * POST /api/auth/logout — destroys the session cookie and returns 200.
 * The client redirects to /login after a successful response.
 */
export async function POST() {
  await destroySession();
  return NextResponse.json({ success: true });
}
