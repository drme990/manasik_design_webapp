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

/** Invalidate the list cache (call after creating/deleting/renaming). */
export function invalidateListCache(): void {
  cache.invalidateList();
}

/** Invalidate a single project from cache (call after saving). */
export function invalidateProjectCache(id: string): void {
  cache.removeItem(id);
}

export async function listProjects(): Promise<Project[]> {
  const cached = cache.getList();
  if (cached) return cached;

  const result = await fetchWithAuth('/api/projects');
  const projects = (result.data || []) as Project[];
  cache.setList(projects);
  return projects;
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
  const { bgUploadStatus: _bgStatus, bgPendingFile: _bgFile, ...rest } = project;
  const clean: Project = {
    ...rest,
    // Don't persist blob: URIs — they're client-side only and would break on reload
    backgroundUri: project.backgroundUri?.startsWith('blob:') ? undefined : project.backgroundUri,
    backgroundThumbnailUri: project.backgroundThumbnailUri?.startsWith('blob:') ? undefined : project.backgroundThumbnailUri,
    // Also strip blob: URIs from image layers (from instant-add image uploads)
    layers: project.layers.map((l) => {
      if (l.type === 'image' && l.uri.startsWith('blob:')) {
        return { ...l, uri: '', uploadStatus: undefined, pendingFile: undefined };
      }
      if (l.type === 'image') {
        const { uploadStatus: _us, pendingFile: _pf, ...imgRest } = l;
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
  cache.setItem(saved);
  cache.invalidateList();
  return saved;
}

export async function createProject(input: ProjectCreateInput): Promise<Project> {
  const result = await fetchWithAuth('/api/projects', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  const project = result.data as Project;
  cache.setItem(project);
  cache.invalidateList();
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
  cache.setItem(updated);
  cache.invalidateList();
  return updated;
}

export async function deleteProject(id: string): Promise<void> {
  await fetchWithAuth(`/api/projects/${id}`, { method: 'DELETE' });
  cache.removeItem(id);
  cache.invalidateList();
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
  cache.setItem(created);
  cache.invalidateList();
  return created;
}

export async function renameProject(id: string, newName: string): Promise<void> {
  const trimmed = newName.trim();
  if (!trimmed) return;
  await updateProjectRemote(id, { name: trimmed });
}
