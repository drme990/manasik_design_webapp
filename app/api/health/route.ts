import { NextResponse } from 'next/server';

/**
 * GET /api/health
 *
 * Lightweight health check for Docker/uptime monitoring.
 * The design app has no DB dependency — just checks the server
 * is responding.
 *
 * Returns 200 if healthy.
 */
export async function GET() {
  return NextResponse.json(
    {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      checks: {
        server: 'ok',
      },
    },
    { status: 200 },
  );
}
