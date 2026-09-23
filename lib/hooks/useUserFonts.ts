'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/client';
import type { UserFont } from '@/components/editor/EditorPage/FontDrawer';

/**
 * Hook for managing user fonts.
 *
 * The font list lives in the shared TanStack Query client
 * (staleTime: Infinity — fetched once per session, cleared on logout).
 *
 * FontFace registration is browser state (document.fonts), not user data —
 * `loadedFontIds`/`loadedCount` stay module-level as a dedupe registry.
 * Font IDs are unique per upload, so a stale registry entry from a previous
 * session can never collide with another user's fonts.
 */

export interface UseUserFontsResult {
  fonts: UserFont[];
  uploading: boolean;
  fontsLoaded: number; // bump on every font registered — triggers canvas re-render
  uploadFont: (file: File) => Promise<UserFont>;
  deleteFont: (id: string) => Promise<boolean>;
}

// Module-level FontFace registration bookkeeping (browser state)
const loadedFontIds = new Set<string>();
let loadedCount = 0;

async function fetchFonts(): Promise<UserFont[]> {
  try {
    const res = await fetch('/api/fonts');
    if (!res.ok) return [];
    const json = await res.json();
    return json.success && Array.isArray(json.data) ? (json.data as UserFont[]) : [];
  } catch {
    return [];
  }
}

/**
 * Register a font with the browser (idempotent per font ID).
 */
async function registerFontFace(font: UserFont): Promise<void> {
  if (loadedFontIds.has(font.id)) return;
  try {
    const face = new FontFace(
      font.family,
      `url(/api/fonts/${font.id}/file)`,
      { style: 'normal', weight: '400' }
    );
    await face.load();
    document.fonts.add(face);
    loadedFontIds.add(font.id);
    loadedCount += 1;
  } catch (e) {
    console.warn(`[fonts] failed to load ${font.name}:`, e);
  }
}

export function useUserFonts(): UseUserFontsResult {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: queryKeys.userFonts,
    queryFn: fetchFonts,
    staleTime: Infinity,
  });
  const [fontsLoaded, setFontsLoaded] = useState(loadedCount);
  const [uploading, setUploading] = useState(false);

  const fonts = useMemo(() => data ?? [], [data]);

  // Register every font the list reports, one FontFace per font ID.
  // fontsLoaded bumps per registration so canvases re-render as fonts
  // become available.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      for (const f of fonts) {
        if (!f || cancelled) continue;
        if (!loadedFontIds.has(f.id)) {
          await registerFontFace(f);
          if (!cancelled) setFontsLoaded(loadedCount);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [fonts]);

  const uploadFont = useCallback(async (file: File): Promise<UserFont> => {
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/fonts', { method: 'POST', body: form });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? 'upload_failed');
      }
      const json = await res.json();
      if (!json.success || !json.data) throw new Error('upload_failed');
      const font = json.data as UserFont;
      // Write through only once the list has loaded — an unseeded query
      // left untouched fetches normally and includes the new font.
      queryClient.setQueryData<UserFont[]>(queryKeys.userFonts, (prev) =>
        prev === undefined ? undefined : [font, ...prev]
      );
      await registerFontFace(font);
      setFontsLoaded(loadedCount);
      return font;
    } finally {
      setUploading(false);
    }
  }, [queryClient]);

  const deleteFont = useCallback(async (id: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/fonts/${id}`, { method: 'DELETE' });
      if (!res.ok) return false;
      queryClient.setQueryData<UserFont[]>(queryKeys.userFonts, (prev) =>
        prev === undefined ? undefined : prev.filter((f) => f.id !== id)
      );
      // The FontFace stays registered in document.fonts — loadedCount
      // keeps counting faces actually registered this session.
      loadedFontIds.delete(id);
      return true;
    } catch {
      return false;
    }
  }, [queryClient]);

  return { fonts, uploading, fontsLoaded, uploadFont, deleteFont };
}
