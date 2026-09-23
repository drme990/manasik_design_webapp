'use client';

import { QueryCache, QueryClient } from '@tanstack/react-query';

/**
 * Shared TanStack Query client — the single cache for all list/identity
 * fetches that are NOT owned by the zustand project store.
 *
 * (The project store IS the documented cache for design/template lists —
 * see AGENTS.md — so those stay in zustand with a freshness TTL rather
 * than maintaining a second cache that would fight optimistic updates.)
 *
 * The same queries are used imperatively (stores call `ensureQueryData`)
 * and declaratively (components call `useQuery`) — both share this cache,
 * so a list fetched by one page is free for any later caller.
 */

const DEFAULT_STALE_TIME = 60_000; // 60s — lists are cheap to revalidate
const GC_TIME = 5 * 60_000;

let browserClient: QueryClient | undefined;

/** True when the thrown fetch error is an expired/missing session —
 *  fetchWithAuth throws the API's `error` field ('unauthorized' on 401). */
function isAuthError(error: unknown): boolean {
  return error instanceof Error && error.message === 'unauthorized';
}

function createClient(): QueryClient {
  return new QueryClient({
    queryCache: new QueryCache({
      onError: (error) => {
        // Expired session → send the user to login. A hard navigation also
        // clears any non-query module state (editor hook caches, FontFace
        // registrations) so nothing leaks into the next session.
        if (isAuthError(error) && typeof window !== 'undefined' && window.location.pathname !== '/login') {
          window.location.assign('/login');
        }
      },
    }),
    defaultOptions: {
      queries: {
        staleTime: DEFAULT_STALE_TIME,
        gcTime: GC_TIME,
        retry: 1,
        refetchOnWindowFocus: false,
      },
    },
  });
}

export function getQueryClient(): QueryClient {
  if (typeof window === 'undefined') {
    // Server: a fresh client per call — never share state across requests.
    return createClient();
  }
  browserClient ??= createClient();
  return browserClient;
}

// ── Query keys ────────────────────────────────────────────────────────

export const queryKeys = {
  authMe: ['auth', 'me'] as const,
  // Project lists + single docs — the single source of truth for
  // designs/templates on the client (replaces the old zustand store).
  designsList: ['projects', 'list', 'design'] as const,
  templatesList: ['projects', 'list', 'booking_template'] as const,
  project: (id: string) => ['projects', 'item', id] as const,
  bookingProductsList: ['booking-products', 'list'] as const,
  bookingProduct: (id: string) => ['booking-products', 'item', id] as const,
  backendProductsList: ['backend-products', 'list'] as const,
  pdfProjectsList: ['pdf-projects', 'list'] as const,
  pdfProject: (id: string) => ['pdf-projects', 'item', id] as const,
  // Editor resources — session-scoped user data.
  savedColors: ['saved-colors'] as const,
  userShapes: ['user-shapes'] as const,
  userFonts: ['user-fonts'] as const,
};
