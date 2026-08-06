import { NextRequest, NextResponse } from 'next/server';
import { extractKeyFromUrl, downloadFromR2 } from '@/lib/storage/r2';

export const runtime = 'nodejs';

/**
 * Server-side image proxy — fetches a remote image and streams it back
 * with permissive CORS headers. Used by the crop modal to avoid
 * canvas tainting when the image host doesn't send CORS headers.
 *
 * On Vercel production, HTTP fetch to the R2 public URL may fail
 * (Cloudflare CDN blocks server-side requests). In that case, falls
 * back to downloading directly from R2 via the S3 API.
 *
 * Usage: GET /api/image-proxy?url=<encoded-image-url>
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get('url');
  if (!url) {
    return NextResponse.json({ error: 'missing url param' }, { status: 400 });
  }

  // Only allow http/https URLs
  if (!/^https?:\/\//i.test(url)) {
    return NextResponse.json({ error: 'invalid url' }, { status: 400 });
  }

  // Strategy 1: HTTP fetch to the public CDN URL
  try {
    const response = await fetch(url, { cache: 'no-store' });
    if (response.ok) {
      const contentType = response.headers.get('content-type') || 'application/octet-stream';
      const buffer = Buffer.from(await response.arrayBuffer());
      return new NextResponse(new Uint8Array(buffer), {
        status: 200,
        headers: {
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=86400',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }
  } catch (error) {
    console.error('[image-proxy] HTTP fetch failed:', error);
  }

  // Strategy 2: Download directly from R2 via the S3 API
  // (bypasses Cloudflare CDN — used when HTTP fetch fails on Vercel)
  const key = extractKeyFromUrl(url);
  if (key) {
    const buffer = await downloadFromR2(key);
    if (buffer) {
      // Infer content type from the file extension
      const ext = key.split('.').pop()?.toLowerCase() || '';
      const contentType =
        ext === 'png' ? 'image/png' :
          ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' :
            ext === 'webp' ? 'image/webp' :
              ext === 'svg' ? 'image/svg+xml' :
                ext === 'gif' ? 'image/gif' :
                  'application/octet-stream';
      return new NextResponse(new Uint8Array(buffer), {
        status: 200,
        headers: {
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=86400',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }
  }

  return NextResponse.json({ error: 'fetch failed' }, { status: 502 });
}
