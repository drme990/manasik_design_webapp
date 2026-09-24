import type { NextConfig } from "next";
import path from 'path';

const nextConfig: NextConfig = {
  turbopack: {
    // Explicit project root to silence workspace-root inference warnings
    // caused by an extra package-lock.json in the parent directory.
    root: path.resolve(process.cwd()),
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'storage.manasik.net',
        pathname: '/**',
      },
    ],
    // Keep optimized variants browser-cached for 30 days (default 60s).
    // Thumbnails/backgrounds carry a ?v= cache-bust, so a changed image
    // always produces a new optimizer URL — long caching is safe.
    minimumCacheTTL: 2592000,
  },
  // @napi-rs/canvas ships a pre-built native binary that must not be
  // processed by the bundler — it needs to be loaded from node_modules
  // at runtime on Vercel serverless functions.
  serverExternalPackages: ['@napi-rs/canvas'],
  allowedDevOrigins: ['192.168.1.16'],
  experimental: {
    // Cache dynamic RSC payloads in the client router for 5min —
    // without this (default 0), every <Link> navigation back to "/"
    // refetches the entire RSC payload, making back-navigation as slow
    // as the initial load. 300s matches the default `static` staleTime
    // used for prefetched links (why /templates already cached). Safe
    // because TanStack Query owns data freshness: a replayed payload
    // only feeds `initialData` props, which mounted sections ignore
    // once the query cache is populated — stale markup can't surface
    // stale data.
    staleTimes: { dynamic: 300 },
  },
  // The app sits behind Nginx (proxy_buffering on by default), which
  // buffers streamed responses — a Suspense boundary's shell would only
  // reach the browser after the whole RSC stream finishes, defeating
  // streaming entirely. X-Accel-Buffering: no tells Nginx to flush each
  // chunk immediately so navigations commit as soon as the shell
  // arrives instead of hanging on the slowest DB query.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [{ key: 'X-Accel-Buffering', value: 'no' }],
      },
    ];
  },
};

export default nextConfig;
