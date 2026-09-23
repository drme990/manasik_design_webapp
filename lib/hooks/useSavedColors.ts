'use client';

import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getQueryClient, queryKeys } from '@/lib/query/client';

/**
 * Hook for managing saved colors.
 *
 * - Server list is cached by the shared TanStack Query client
 *   (staleTime: Infinity — fetched once per session, cleared on logout).
 * - addColor/removeColor update local state only (deferred).
 * - saveColors() persists the current local list to the API.
 * - persistColor() adds + saves immediately (used by color picker).
 */

async function fetchSavedColors(): Promise<string[]> {
  try {
    const res = await fetch('/api/saved-colors');
    if (!res.ok) return [];
    const json = await res.json();
    return json.success && Array.isArray(json.data) ? (json.data as string[]) : [];
  } catch {
    return [];
  }
}

async function persistColors(colors: string[]): Promise<void> {
  // Write through to the query cache immediately (optimistic), then POST.
  getQueryClient().setQueryData(queryKeys.savedColors, colors);
  try {
    await fetch('/api/saved-colors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ colors }),
    });
  } catch {
    // ignore — local state is already updated
  }
}

export function useSavedColors() {
  const { data } = useQuery({
    queryKey: queryKeys.savedColors,
    queryFn: fetchSavedColors,
    staleTime: Infinity,
  });
  const [savedColors, setSavedColors] = useState<string[]>(data ?? []);
  // Tracks the last persisted state so we can detect unsaved changes
  const [persistedColors, setPersistedColors] = useState<string[]>(data ?? []);
  // Sync local state when server data arrives (first load) or changes
  // via persistColors — React's "adjust state during render" pattern.
  const [prevData, setPrevData] = useState(data);
  if (data !== prevData) {
    setPrevData(data);
    if (data) {
      setSavedColors(data);
      setPersistedColors(data);
    }
  }

  // Add color locally only (deferred — call saveColors() to persist)
  const addColor = useCallback((color: string) => {
    setSavedColors((prev) => {
      const normalized = color.toUpperCase();
      if (prev.some((c) => c.toUpperCase() === normalized)) return prev;
      return [...prev, normalized];
    });
  }, []);

  // Remove color locally only (deferred)
  const removeColor = useCallback((color: string) => {
    setSavedColors((prev) =>
      prev.filter((c) => c.toUpperCase() !== color.toUpperCase())
    );
  }, []);

  // Add + persist immediately (used by color picker)
  const persistColor = useCallback((color: string) => {
    const normalized = color.toUpperCase();
    setSavedColors((prev) => {
      if (prev.some((c) => c.toUpperCase() === normalized)) return prev;
      const next = [...prev, normalized];
      persistColors(next);
      return next;
    });
    setPersistedColors((prev) => {
      if (prev.some((c) => c.toUpperCase() === normalized)) return prev;
      const next = [...prev, normalized];
      return next;
    });
  }, []);

  // Persist the current local list to DB
  const saveColors = useCallback(() => {
    persistColors(savedColors);
    setPersistedColors(savedColors);
  }, [savedColors]);

  // Check if local state differs from persisted state
  const hasUnsavedChanges = (() => {
    if (savedColors.length !== persistedColors.length) return true;
    const persistedSet = new Set(persistedColors.map((c) => c.toUpperCase()));
    return savedColors.some((c) => !persistedSet.has(c.toUpperCase()));
  })();

  return { savedColors, addColor, removeColor, persistColor, saveColors, hasUnsavedChanges };
}
