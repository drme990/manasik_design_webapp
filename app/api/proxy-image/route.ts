import { NextRequest, NextResponse } from 'next/server';
import { extractKeyFromUrl, downloadFromR2 } from '@/lib/storage/r2';

/**
 * GET /api/proxy-image?url=<encoded-url>
 *
 * Fetches an image from R2 (or any URL) server-side and returns it
 * with permissive CORS headers. Used by the thumbnail capture when
 * the browser can't fetch R2 images directly due to CORS.
 *
 * On Vercel production, HTTP fetch to the R2 public URL may fail
 * (Cloudflare CDN blocks server-side requests). In that case, falls
 * back to downloading directly from R2 via the S3 API.
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

  // Strategy 1: HTTP fetch to the public CDN URL
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (res.ok) {
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
    }
  } catch (error) {
    console.error('[proxy-image] HTTP fetch failed:', error);
  }

  // Strategy 2: Download directly from R2 via the S3 API
  const key = extractKeyFromUrl(url);
  if (key) {
    const buffer = await downloadFromR2(key);
    if (buffer) {
      const ext = key.split('.').pop()?.toLowerCase() || '';
      const contentType =
        ext === 'png' ? 'image/png' :
          ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' :
            ext === 'webp' ? 'image/webp' :
              ext === 'svg' ? 'image/svg+xml' :
                ext === 'gif' ? 'image/gif' :
                  'image/jpeg';
      return new NextResponse(new Uint8Array(buffer), {
        status: 200,
        headers: {
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=3600',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }
  }

  return NextResponse.json({ error: 'fetch failed' }, { status: 502 });
}
