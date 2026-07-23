import type { PdfProject, PdfProjectCreateInput, PdfProjectUpdateInput, PdfImage } from '@/types';
import { fetchWithAuth } from './fetch-with-auth';
import { createResourceCache } from './cache';

/**
 * PDF project store — API-first architecture (same pattern as
 * lib/store/projects.ts). PDF projects live in MongoDB (via
 * /api/pdf-projects) and R2 (for images). No IndexedDB, no localStorage
 * mirror — the database is the single source of truth. An in-memory cache
 * avoids redundant API calls when navigating between pages within the same
 * session.
 */

const CACHE_TTL_MS = 30_000; // 30 seconds
const cache = createResourceCache<PdfProject>(CACHE_TTL_MS);

/** Invalidate the list cache (call after creating/deleting/renaming). */
export function invalidatePdfListCache(): void {
  cache.invalidateList();
}

/** Get stale list for instant UI rendering (may be expired). */
export function getStalePdfProjects(): PdfProject[] | null {
  return cache.getStaleList();
}

export async function listPdfProjects(): Promise<PdfProject[]> {
  const cached = cache.getList();
  if (cached) return cached;

  const result = await fetchWithAuth('/api/pdf-projects');
  const projects = (result.data || []) as PdfProject[];
  cache.setList(projects);
  return projects;
}

export async function getPdfProject(id: string): Promise<PdfProject | null> {
  const cached = cache.getItem(id);
  if (cached) return cached;

  try {
    const result = await fetchWithAuth(`/api/pdf-projects/${id}`);
    const project = result.data as PdfProject;
    cache.setItem(project);
    return project;
  } catch (error) {
    console.warn('Failed to fetch PDF project from API:', error);
    return cache.getStaleItem(id);
  }
}

export async function createPdfProject(name: string, images: PdfImage[]): Promise<PdfProject> {
  const result = await fetchWithAuth('/api/pdf-projects', {
    method: 'POST',
    body: JSON.stringify({ name, images } as PdfProjectCreateInput),
  });
  const created = result.data as PdfProject;
  cache.upsertItemInList(created);
  return created;
}

export async function savePdfProject(project: PdfProject): Promise<PdfProject> {
  const result = await fetchWithAuth(`/api/pdf-projects/${project.id}`, {
    method: 'PATCH',
    body: JSON.stringify(project),
  });
  const saved = result.data as PdfProject;
  cache.upsertItemInList(saved);
  return saved;
}

export async function updatePdfProject(id: string, updates: PdfProjectUpdateInput): Promise<PdfProject | null> {
  const result = await fetchWithAuth(`/api/pdf-projects/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
  const updated = result.data as PdfProject;
  cache.upsertItemInList(updated);
  return updated;
}

export async function renamePdfProject(id: string, newName: string): Promise<void> {
  const trimmed = newName.trim();
  if (!trimmed) return;
  await updatePdfProject(id, { name: trimmed });
}

export async function deletePdfProject(id: string): Promise<void> {
  await fetchWithAuth(`/api/pdf-projects/${id}`, { method: 'DELETE' });
  cache.removeItem(id);
}
