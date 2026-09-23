'use client';

import { useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/client';
import { fetchWithAuth } from '@/lib/store/fetch-with-auth';
import type { UserShape } from '@/components/editor/EditorPage/ShapesDrawer';

const MAX_SIZE = 500 * 1024; // 500 KB
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];

/**
 * Hook for managing user-uploaded shapes (PNG/SVG/etc.).
 *
 * The list lives in the shared TanStack Query client (staleTime: Infinity —
 * fetched once per session, cleared on logout). Upload/delete write through
 * to the cache so every hook consumer stays in sync.
 */

async function fetchShapes(): Promise<UserShape[]> {
  try {
    const json = (await fetchWithAuth('/api/shapes')) as { data?: UserShape[] };
    return json.data ?? [];
  } catch {
    return [];
  }
}

export function useUserShapes() {
  const queryClient = useQueryClient();
  const { data, refetch } = useQuery({
    queryKey: queryKeys.userShapes,
    queryFn: fetchShapes,
    staleTime: Infinity,
  });
  const shapes = data ?? [];
  const [uploading, setUploading] = useState(false);

  // Write-through to the cache — but only once the list has loaded.
  // Returning undefined leaves an unseeded query untouched so a
  // first upload doesn't mask the real list (staleTime: Infinity
  // would otherwise treat the partial list as fresh forever).
  const setCached = useCallback(
    (updater: (prev: UserShape[]) => UserShape[]) => {
      queryClient.setQueryData<UserShape[]>(queryKeys.userShapes, (prev) =>
        prev === undefined ? undefined : updater(prev)
      );
    },
    [queryClient]
  );

  const uploadShape = useCallback(async (file: File): Promise<UserShape> => {
    if (!ALLOWED_TYPES.includes(file.type)) throw new Error('unsupported_type');
    if (file.size > MAX_SIZE) throw new Error('file_too_large');
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/shapes', { method: 'POST', body: form });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? 'upload_failed');
      }
      const json = await res.json();
      const shape = json.data as UserShape;
      setCached((prev) => [shape, ...prev]);
      return shape;
    } finally {
      setUploading(false);
    }
  }, [setCached]);

  const deleteShape = useCallback(async (id: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/shapes/${id}`, { method: 'DELETE' });
      if (!res.ok) return false;
      setCached((prev) => prev.filter((s) => s.id !== id));
      return true;
    } catch {
      return false;
    }
  }, [setCached]);

  return {
    shapes,
    uploading,
    uploadShape,
    deleteShape,
    refresh: () => void refetch(),
  };
}
