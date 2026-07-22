'use client';

import { useState, useCallback, useRef, useEffect } from 'react';

/**
 * Shape of a user-uploaded PNG shape, matching the API response.
 */
export interface UserShape {
  id: string;
  userId: string;
  name: string;
  url: string;
  thumbnailUrl?: string;
  naturalWidth: number;
  naturalHeight: number;
  contentType: string;
  size: number;
  createdAt: number;
}

// Module-level cache — survives across hook instances within the same session.
let cachedShapes: UserShape[] | null = null;
let fetchPromise: Promise<UserShape[]> | null = null;

async function fetchShapes(): Promise<UserShape[]> {
  if (cachedShapes !== null) return cachedShapes;
  if (fetchPromise) return fetchPromise;

  fetchPromise = (async () => {
    try {
      const res = await fetch('/api/shapes');
      if (!res.ok) return [];
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        cachedShapes = json.data as UserShape[];
        return cachedShapes;
      }
      return [];
    } catch {
      return [];
    } finally {
      fetchPromise = null;
    }
  })();

  return fetchPromise;
}

function invalidateCache() {
  cachedShapes = null;
}

/**
 * Hook for managing user-uploaded PNG shapes.
 *
 * - Fetches the shape list once per session (cached at module level).
 * - uploadShape() uploads a PNG file and adds it to the list.
 * - deleteShape() removes a shape from the server and the list.
 */
export function useUserShapes() {
  const [shapes, setShapes] = useState<UserShape[]>(cachedShapes ?? []);
  const [loading, setLoading] = useState(cachedShapes === null);
  const [uploading, setUploading] = useState(false);
  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    if (cachedShapes !== null) {
      setShapes(cachedShapes);
      setLoading(false);
      return;
    }
    fetchShapes().then((list) => {
      if (!mountedRef.current) return;
      setShapes(list);
      setLoading(false);
    });
    return () => { mountedRef.current = false; };
  }, []);

  const uploadShape = useCallback(async (file: File): Promise<UserShape | null> => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/shapes', { method: 'POST', body: formData });
      if (!res.ok) {
        const json = await res.json().catch(() => ({ error: 'unknown' }));
        throw new Error(json.error || 'uploadFailed');
      }
      const json = await res.json();
      if (!json.success || !json.data) throw new Error('uploadFailed');
      const shape = json.data as UserShape;
      // Update cache + state
      if (cachedShapes) {
        cachedShapes = [...cachedShapes, shape];
      } else {
        cachedShapes = [shape];
      }
      if (mountedRef.current) setShapes(cachedShapes);
      return shape;
    } finally {
      if (mountedRef.current) setUploading(false);
    }
  }, []);

  const deleteShape = useCallback(async (id: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/shapes/${id}`, { method: 'DELETE' });
      if (!res.ok) return false;
      cachedShapes = (cachedShapes ?? []).filter((s) => s.id !== id);
      if (mountedRef.current) setShapes(cachedShapes ?? []);
      return true;
    } catch {
      return false;
    }
  }, []);

  return {
    shapes,
    loading,
    uploading,
    uploadShape,
    deleteShape,
    refresh: () => { invalidateCache(); return fetchShapes(); },
  };
}
