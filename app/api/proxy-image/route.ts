import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/proxy-image?url=<encoded-url>
 *
 * Fetches an image from R2 (or any URL) server-side and returns it
 * with permissive CORS headers. Used by the thumbnail capture when
 * the browser can't fetch R2 images directly due to CORS.
 *
 * This is a fallback — the primary fix is setting CORS rules on the
 * R2 bucket (see scripts/set-r2-cors.ts). This proxy ensures the
 * thumbnail capture works even before CORS is configured.
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get('url');
  if (!url) {
    return NextResponse.json({ error: 'missing url param' }, { status: 400 });
  }

  // Only allow proxying from our own R2 storage or localhost
  // (prevent SSRF — don't allow arbitrary URLs)
  const allowed = [
    'https://storage.manasik.net',
    'http://localhost',
    'https://design.manasik.net',
    'https://admin.manasik.net',
  ];
  if (!allowed.some((prefix) => url.startsWith(prefix))) {
    return NextResponse.json({ error: 'url not allowed' }, { status: 403 });
  }

  try {
    const res = await fetch(url);
    if (!res.ok) {
      return NextResponse.json({ error: `fetch failed: ${res.status}` }, { status: res.status });
    }
    const contentType = res.headers.get('content-type') || 'image/jpeg';
    const buffer = await res.arrayBuffer();
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error) {
    console.error('[proxy-image]', error);
    return NextResponse.json({ error: 'fetch failed' }, { status: 500 });
  }
}
