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
  },
  allowedDevOrigins: ['dayana-nondepressing-probingly.ngrok-free.dev', '192.168.1.16'],
};

export default nextConfig;
