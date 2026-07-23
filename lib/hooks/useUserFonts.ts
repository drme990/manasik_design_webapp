'use client';

import { useState, useCallback, useRef, useEffect } from 'react';

/**
 * Shape of a user-uploaded font, matching the API response.
 */
export interface UserFont {
  id: string;
  userId: string;
  family: string;
  name: string;
  url: string;
  format: string; // 'woff2' | 'truetype' | 'opentype' | 'woff' | 'embedded-opentype'
  weight: number;
  contentType: string;
  size: number;
  createdAt: number;
}

// Module-level cache — survives across hook instances within the same session.
// Avoids re-fetching the font list every time the font drawer opens.
let cachedFonts: UserFont[] | null = null;
let fetchPromise: Promise<UserFont[]> | null = null;

// Track which font IDs we've already registered via FontFace API so we
// don't register the same font twice.
const loadedFontIds = new Set<string>();

// Track the number of fonts that have been successfully loaded, so we can
// trigger a re-render when a new font becomes available.
let loadedCount = 0;

async function fetchFonts(): Promise<UserFont[]> {
  if (cachedFonts !== null) return cachedFonts;
  if (fetchPromise) return fetchPromise;

  fetchPromise = (async () => {
    try {
      const res = await fetch('/api/fonts');
      if (!res.ok) return [];
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        cachedFonts = json.data as UserFont[];
        return cachedFonts;
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
  cachedFonts = null;
}

/**
 * Register a single user font with the browser via the FontFace API.
 *
 * Instead of passing the R2 URL directly (which would require CORS on R2),
 * we fetch the font binary through our own /api/fonts/[id]/file endpoint
 * (same-origin, no CORS issues) and pass the ArrayBuffer to FontFace.
 *
 * Returns true if the font loaded successfully.
 */
async function registerFontFace(font: UserFont): Promise<boolean> {
  if (loadedFontIds.has(font.id)) return true;
  try {
    // Fetch the font binary through our same-origin proxy endpoint
    const res = await fetch(`/api/fonts/${font.id}/file`);
    if (!res.ok) {
      console.warn(`Failed to fetch font binary for ${font.family}: ${res.status}`);
      return false;
    }
    const buffer = await res.arrayBuffer();
    const face = new FontFace(font.family, buffer, {
      weight: font.weight.toString(),
      style: 'normal',
    });
    await face.load();
    document.fonts.add(face);
    loadedFontIds.add(font.id);
    loadedCount++;
    return true;
  } catch (err) {
    console.warn(`Failed to load font ${font.family}:`, err);
    return false;
  }
}

/**
 * Hook for managing user-uploaded fonts.
 *
 * - Fetches the font list once per session (cached at module level).
 * - Loads each font into the browser via the FontFace API (using ArrayBuffer
 *   fetched through our same-origin proxy to bypass CORS on R2).
 * - `fontsLoaded` counter increments when a font finishes loading, so
 *   consumers can trigger a re-render to apply the newly loaded font.
 * - uploadFont() uploads a file and adds it to the list.
 * - deleteFont() removes a font from the server and the list.
 */
export function useUserFonts() {
  const [fonts, setFonts] = useState<UserFont[]>(cachedFonts ?? []);
  const [loading, setLoading] = useState(cachedFonts === null);
  const [uploading, setUploading] = useState(false);
  // Bump this counter whenever a font finishes loading — triggers re-render
  // so text layers pick up the newly available font face.
  const [fontsLoaded, setFontsLoaded] = useState(loadedCount);
  // Sync with module cache if another hook instance populated it
  const [prevCached, setPrevCached] = useState(cachedFonts);
  if (cachedFonts !== prevCached) {
    setPrevCached(cachedFonts);
    setFonts(cachedFonts ?? []);
    setLoading(false);
  }
  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    if (cachedFonts !== null) {
      // Register any not-yet-loaded fonts
      cachedFonts.forEach((f) => {
        registerFontFace(f).then(() => {
          if (mountedRef.current) setFontsLoaded(loadedCount);
        });
      });
      return;
    }
    fetchFonts().then((list) => {
      if (!mountedRef.current) return;
      setFonts(list);
      setLoading(false);
      // Load each font into the browser
      list.forEach((f) => {
        registerFontFace(f).then(() => {
          if (mountedRef.current) setFontsLoaded(loadedCount);
        });
      });
    });
    return () => { mountedRef.current = false; };
  }, []);

  const uploadFont = useCallback(async (file: File): Promise<UserFont | null> => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/fonts', { method: 'POST', body: formData });
      if (!res.ok) {
        const json = await res.json().catch(() => ({ error: 'unknown' }));
        throw new Error(json.error || 'uploadFailed');
      }
      const json = await res.json();
      if (!json.success || !json.data) throw new Error('uploadFailed');
      const font = json.data as UserFont;
      // Register immediately so it's usable
      await registerFontFace(font);
      setFontsLoaded(loadedCount);
      // Update cache + state
      if (cachedFonts) {
        cachedFonts = [...cachedFonts, font];
      } else {
        cachedFonts = [font];
      }
      if (mountedRef.current) setFonts(cachedFonts);
      return font;
    } finally {
      if (mountedRef.current) setUploading(false);
    }
  }, []);

  const deleteFont = useCallback(async (id: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/fonts/${id}`, { method: 'DELETE' });
      if (!res.ok) return false;
      cachedFonts = (cachedFonts ?? []).filter((f) => f.id !== id);
      loadedFontIds.delete(id);
      if (mountedRef.current) setFonts(cachedFonts ?? []);
      return true;
    } catch {
      return false;
    }
  }, []);

  return {
    fonts,
    loading,
    uploading,
    fontsLoaded,
    uploadFont,
    deleteFont,
    refresh: () => { invalidateCache(); return fetchFonts(); },
  };
}
