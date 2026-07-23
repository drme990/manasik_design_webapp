'use client';

import { useState, useCallback, useRef, useEffect } from 'react';

/**
 * Session-cached hook for managing saved colors.
 *
 * - Fetches once per session (not every time the color picker opens).
 * - addColor/removeColor update local state only (deferred).
 * - saveColors() persists the current local list to the API.
 * - persistColor() adds + saves immediately (used by color picker).
 */

// Module-level cache — survives across hook instances within the same session
let cachedColors: string[] | null = null;
let fetchPromise: Promise<string[]> | null = null;

async function fetchColors(): Promise<string[]> {
  if (cachedColors !== null) return cachedColors;
  if (fetchPromise) return fetchPromise;

  fetchPromise = (async () => {
    try {
      const res = await fetch('/api/saved-colors');
      if (!res.ok) return [];
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        cachedColors = json.data as string[];
        return cachedColors;
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

async function persistColors(colors: string[]): Promise<void> {
  cachedColors = colors;
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
  const [savedColors, setSavedColors] = useState<string[]>(cachedColors ?? []);
  // Tracks the last persisted state so we can detect unsaved changes
  const [persistedColors, setPersistedColors] = useState<string[]>(cachedColors ?? []);
  // Sync with module cache if another hook instance populated it
  const [prevCached, setPrevCached] = useState(cachedColors);
  if (cachedColors !== prevCached) {
    setPrevCached(cachedColors);
    setSavedColors(cachedColors ?? []);
    setPersistedColors(cachedColors ?? []);
  }
  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    if (cachedColors !== null) return;
    fetchColors().then((colors) => {
      if (mountedRef.current) {
        setSavedColors(colors);
        setPersistedColors(colors);
      }
    });
    return () => { mountedRef.current = false; };
  }, []);

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
