import type { Project, ProjectCreateInput, ProjectUpdateInput } from '@/types';
import { generateId } from '@/lib/utils/id';
import { fetchWithAuth } from './fetch-with-auth';
import { createResourceCache } from './cache';

/**
 * Project store — API-first architecture.
 *
 * - Projects live in MongoDB (via /api/projects) and R2 (for images).
 * - No IndexedDB, no localStorage mirror. The database is the single source
 *   of truth — positions never drift on reopen because we always load from
 *   the server.
 * - An in-memory cache (see lib/store/cache.ts) is used to avoid redundant
 *   API calls when navigating between pages within the same session.
 * - The editor keeps working state in React (and optionally sessionStorage
 *   for crash recovery), and only writes to the DB when the user clicks
 *   "Save" or confirms "Yes" on the leave modal.
 */

const CACHE_TTL_MS = 60_000; // 60 seconds
const cache = createResourceCache<Project>(CACHE_TTL_MS);
const templateCache = createResourceCache<Project>(CACHE_TTL_MS);

/** Invalidate the list cache (call after creating/deleting/renaming). */
export function invalidateListCache(): void {
  cache.invalidateList();
  templateCache.invalidateList();
}

/** Get stale list for instant UI rendering (may be expired). */
export function getStaleProjects(): Project[] | null {
  return cache.getStaleList();
}

/** Get stale template list for instant UI rendering. */
export function getStaleTemplates(): Project[] | null {
  return templateCache.getStaleList();
}

/** Invalidate a single project from cache (call after saving). */
export function invalidateProjectCache(id: string): void {
  cache.removeItem(id);
  templateCache.removeItem(id);
}

export async function listProjects(): Promise<Project[]> {
  const cached = cache.getList();
  if (cached) return cached;

  const result = await fetchWithAuth('/api/projects');
  const projects = (result.data || []) as Project[];
  cache.setList(projects);
  return projects;
}

/** List all booking_template projects (templates). */
export async function listTemplates(): Promise<Project[]> {
  const cached = templateCache.getList();
  if (cached) return cached;

  const result = await fetchWithAuth('/api/projects?kind=booking_template');
  const templates = (result.data || []) as Project[];
  templateCache.setList(templates);
  return templates;
}

/**
 * Load a single project from the API. Always fetches the latest from the
 * server — no local storage fallback — so positions never drift.
 */
export async function getProject(id: string): Promise<Project | null> {
  const cached = cache.getItem(id);
  if (cached) {
    // Still fetch in background to refresh cache, but return cached for UX
    fetchWithAuth(`/api/projects/${id}`)
      .then((result) => cache.setItem(result.data as Project))
      .catch(() => { /* ignore background refresh errors */ });
    return cached;
  }

  try {
    const result = await fetchWithAuth(`/api/projects/${id}`);
    const project = result.data as Project;
    cache.setItem(project);
    return project;
  } catch (error) {
    console.warn('Failed to fetch project from API:', error);
    // Last resort: stale in-memory cache
    return cache.getStaleItem(id);
  }
}

/**
 * Save a project to the server (MongoDB) via PATCH.
 * This is the only write path — call it from the Save button or the
 * leave-modal "Yes" handler.
 *
 * Strips transient fields (bgUploadStatus, bgPendingFile) and any blob: URIs
 * (from instant-add background uploads that haven't finished) before sending.
 */
export async function saveProject(project: Project): Promise<Project> {
  // Strip transient fields and blob: URIs before persisting
  const clean: Project = {
    ...project,
    bgUploadStatus: undefined,
    bgPendingFile: undefined,
    // Don't persist blob: URIs — they're client-side only and would break on reload
    backgroundUri: project.backgroundUri?.startsWith('blob:') ? undefined : project.backgroundUri,
    backgroundThumbnailUri: project.backgroundThumbnailUri?.startsWith('blob:') ? undefined : project.backgroundThumbnailUri,
    // Also strip blob: URIs from image layers (from instant-add image uploads)
    layers: project.layers.map((l) => {
      if (l.type === 'image' && l.uri.startsWith('blob:')) {
        return { ...l, uri: '', uploadStatus: undefined, pendingFile: undefined };
      }
      if (l.type === 'image') {
        const imgRest = { ...l };
        delete (imgRest as Partial<typeof l>).uploadStatus;
        delete (imgRest as Partial<typeof l>).pendingFile;
        return imgRest as typeof l;
      }
      return l;
    }),
  };
  const result = await fetchWithAuth(`/api/projects/${project.id}`, {
    method: 'PATCH',
    body: JSON.stringify(clean),
  });
  const saved = result.data as Project;
  cache.upsertItemInList(saved);
  return saved;
}

/** Invalidate caches after a thumbnail upload so the next fetch picks it up. */
export function invalidateProjectThumbnail(projectId: string): void {
  cache.removeItem(projectId);
  cache.invalidateList();
  templateCache.removeItem(projectId);
  templateCache.invalidateList();
}

export async function createProject(input: ProjectCreateInput): Promise<Project> {
  const result = await fetchWithAuth('/api/projects', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  const project = result.data as Project;
  cache.upsertItemInList(project);
  if (project.kind === 'booking_template') {
    templateCache.upsertItemInList(project);
  }
  return project;
}

/**
 * Update a project on the server directly. Used by rename, etc.
 */
export async function updateProjectRemote(id: string, updates: ProjectUpdateInput): Promise<Project | null> {
  const result = await fetchWithAuth(`/api/projects/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
  const updated = result.data as Project;
  cache.upsertItemInList(updated);
  return updated;
}

export async function deleteProject(id: string): Promise<void> {
  await fetchWithAuth(`/api/projects/${id}`, { method: 'DELETE' });
  cache.removeItem(id);
  templateCache.removeItem(id);
}

/**
 * Optimistically delete a project: remove it from the cache immediately (so
 * any UI reading from the cache — e.g. the /projects list — reflects the
 * deletion instantly) and fire the DELETE request in the background without
 * waiting for it. Use this when the caller has already navigated (or is
 * about to navigate) away and doesn't need to block on the server response —
 * e.g. discarding a blank/never-saved project when leaving the editor.
 */
export function deleteProjectOptimistic(id: string): void {
  cache.removeItem(id);
  templateCache.removeItem(id);
  fetchWithAuth(`/api/projects/${id}`, { method: 'DELETE' }).catch((error) => {
    console.error(`Failed to delete project ${id} on server:`, error);
  });
}

export async function duplicateProject(id: string): Promise<Project | null> {
  const project = await getProject(id);
  if (!project) return null;

  const result = await fetchWithAuth('/api/projects', {
    method: 'POST',
    body: JSON.stringify({
      name: `${project.name} — نسخة`,
      kind: project.kind,
      canvasWidth: project.canvasWidth,
      canvasHeight: project.canvasHeight,
      backgroundColor: project.backgroundColor,
      backgroundUri: project.backgroundUri,
      layers: project.layers.map((layer) => ({ ...layer, id: generateId() })),
      bookingMeta: project.bookingMeta,
    } as ProjectCreateInput),
  });
  const created = result.data as Project;
  cache.upsertItemInList(created);
  return created;
}

export async function renameProject(id: string, newName: string): Promise<void> {
  const trimmed = newName.trim();
  if (!trimmed) return;
  await updateProjectRemote(id, { name: trimmed });
}
