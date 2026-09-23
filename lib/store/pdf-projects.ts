import type { PdfProject, PdfProjectCreateInput, PdfProjectUpdateInput, PdfImage } from '@/types';
import { fetchWithAuth } from './fetch-with-auth';
import { getQueryClient, queryKeys } from '@/lib/query/client';

/**
 * PDF project store — API-first architecture. PDF projects live in
 * MongoDB (via /api/pdf-projects) and R2 (for images). No IndexedDB, no
 * localStorage mirror — the database is the single source of truth.
 *
 * Caching is handled by the shared TanStack Query client (lib/query):
 * `fetchQuery` dedupes in-flight calls and serves cached data within
 * `staleTime` (refetching when stale); mutations update the cached
 * list/items surgically via `setQueryData` so no extra refetch is needed
 * after writes.
 */

/** Raw fetcher — the queryFn behind `queryKeys.pdfProjectsList`. */
export async function fetchPdfProjects(): Promise<PdfProject[]> {
  const result = await fetchWithAuth('/api/pdf-projects');
  return (result.data || []) as PdfProject[];
}

/** Invalidate the list cache (call after creating/deleting/renaming). */
export function invalidatePdfListCache(): void {
  void getQueryClient().invalidateQueries({ queryKey: queryKeys.pdfProjectsList });
}

export async function getPdfProject(id: string): Promise<PdfProject | null> {
  const qc = getQueryClient();
  try {
    return await qc.fetchQuery({
      queryKey: queryKeys.pdfProject(id),
      queryFn: async () => {
        const result = await fetchWithAuth(`/api/pdf-projects/${id}`);
        return result.data as PdfProject;
      },
    });
  } catch (error) {
    console.warn('Failed to fetch PDF project from API:', error);
    return qc.getQueryData(queryKeys.pdfProject(id)) ?? null;
  }
}

/** Update-or-insert a project into the cached list (surgical, no refetch). */
function upsertInCachedList(item: PdfProject): void {
  const qc = getQueryClient();
  qc.setQueryData(queryKeys.pdfProject(item.id), item);
  qc.setQueryData<PdfProject[]>(queryKeys.pdfProjectsList, (old) => {
    if (!old) return [item];
    const idx = old.findIndex((p) => p.id === item.id);
    if (idx >= 0) {
      const copy = [...old];
      copy[idx] = item;
      return copy;
    }
    return [item, ...old];
  });
}

export async function createPdfProject(name: string, images: PdfImage[]): Promise<PdfProject> {
  const result = await fetchWithAuth('/api/pdf-projects', {
    method: 'POST',
    body: JSON.stringify({ name, images } as PdfProjectCreateInput),
  });
  const created = result.data as PdfProject;
  upsertInCachedList(created);
  return created;
}

export async function savePdfProject(project: PdfProject): Promise<PdfProject> {
  const result = await fetchWithAuth(`/api/pdf-projects/${project.id}`, {
    method: 'PATCH',
    body: JSON.stringify(project),
  });
  const saved = result.data as PdfProject;
  upsertInCachedList(saved);
  return saved;
}

export async function updatePdfProject(id: string, updates: PdfProjectUpdateInput): Promise<PdfProject | null> {
  const result = await fetchWithAuth(`/api/pdf-projects/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
  const updated = result.data as PdfProject;
  upsertInCachedList(updated);
  return updated;
}

export async function renamePdfProject(id: string, newName: string): Promise<void> {
  const trimmed = newName.trim();
  if (!trimmed) return;
  await updatePdfProject(id, { name: trimmed });
}

export async function deletePdfProject(id: string): Promise<void> {
  await fetchWithAuth(`/api/pdf-projects/${id}`, { method: 'DELETE' });
  const qc = getQueryClient();
  qc.removeQueries({ queryKey: queryKeys.pdfProject(id) });
  qc.setQueryData<PdfProject[]>(queryKeys.pdfProjectsList, (old) =>
    old?.filter((p) => p.id !== id),
  );
}
