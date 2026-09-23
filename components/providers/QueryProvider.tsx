'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import { getQueryClient } from '@/lib/query/client';
import type { ReactNode } from 'react';

export default function QueryProvider({ children }: { children: ReactNode }) {
  // Module-level singleton — stable across renders and navigations.
  const client = getQueryClient();
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
