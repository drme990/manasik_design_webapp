import type { NextConfig } from "next";
import createNextIntlPlugin from 'next-intl/plugin';
import path from 'path';

const nextIntlConfig = createNextIntlPlugin('./i18n/request.ts');

const nextConfig: NextConfig = {
  turbopack: {
    // Explicit project root to silence workspace-root inference warnings
    // caused by an extra package-lock.json in the parent directory.
    root: path.resolve(process.cwd()),
  },
};

export default nextIntlConfig(nextConfig);
