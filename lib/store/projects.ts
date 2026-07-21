import type { Project, ProjectCreateInput, ProjectUpdateInput } from '@/types';
import { generateId } from '@/lib/utils/id';

/**
 * Project store — API-first architecture.
 *
 * - Projects live in MongoDB (via /api/projects) and R2 (for images).
 * - No IndexedDB, no localStorage mirror. The database is the single source
 *   of truth — positions never drift on reopen because we always load from
 *   the server.
 * - An in-memory cache (Map) is used to avoid redundant API calls when
 *   navigating between pages within the same session.
 * - The editor keeps working state in React (and optionally sessionStorage
 *   for crash recovery), and only writes to the DB when the user clicks
 *   "Save" or confirms "Yes" on the leave modal.
 */

async function fetchWithAuth(url: string, options: RequestInit = {}) {
  const response = await fetch(url, {
    ...options,
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'unknown' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

// ─── In-memory cache ─────────────────────────────────────────────────────────
// Avoids redundant API calls when navigating between pages.
// Cache is invalidated when a project is saved/deleted or explicitly.

const projectCache = new Map<string, { project: Project; cachedAt: number }>();
let listCache: { projects: Project[]; cachedAt: number } | null = null;
const CACHE_TTL_MS = 60_000; // 60 seconds

/** Invalidate the list cache (call after creating/deleting/renaming). */
export function invalidateListCache(): void {
  listCache = null;
}

/** Invalidate a single project from cache (call after saving). */
export function invalidateProjectCache(id: string): void {
  projectCache.delete(id);
}

/** Invalidate all caches. */
export function invalidateAllCaches(): void {
  projectCache.clear();
  listCache = null;
}

export async function listProjects(): Promise<Project[]> {
  // Return cached list if fresh
  if (listCache && Date.now() - listCache.cachedAt < CACHE_TTL_MS) {
    return listCache.projects;
  }

  const result = await fetchWithAuth('/api/projects');
  const projects = (result.data || []) as Project[];

  // Update caches
  listCache = { projects, cachedAt: Date.now() };
  for (const p of projects) {
    projectCache.set(p.id, { project: p, cachedAt: Date.now() });
  }
  return projects;
}

export async function listAllProjects(): Promise<Project[]> {
  return listProjects();
}

export async function listBookingTemplateProjects(): Promise<Project[]> {
  const projects = await listProjects();
  return projects.filter((p) => p.kind === 'booking_template');
}

/**
 * Load a single project from the API. Always fetches the latest from the
 * server — no local storage fallback — so positions never drift.
 */
export async function loadProject(id: string): Promise<Project | null> {
  // Use in-memory cache as instant fallback only if fresh
  const cached = projectCache.get(id);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    // Still fetch in background to refresh cache, but return cached for UX
    fetchWithAuth(`/api/projects/${id}`)
      .then((result) => {
        const fresh = result.data as Project;
        projectCache.set(id, { project: fresh, cachedAt: Date.now() });
      })
      .catch(() => { /* ignore background refresh errors */ });
    return cached.project;
  }

  try {
    const result = await fetchWithAuth(`/api/projects/${id}`);
    const project = result.data as Project;
    projectCache.set(id, { project, cachedAt: Date.now() });
    return project;
  } catch (error) {
    console.warn('Failed to fetch project from API:', error);
    // Last resort: stale in-memory cache
    if (cached) return cached.project;
    return null;
  }
}

export async function getProject(id: string): Promise<Project | null> {
  return loadProject(id);
}

/**
 * Save a project to the server (MongoDB) via PATCH.
 * This is the only write path — call it from the Save button or the
 * leave-modal "Yes" handler.
 */
export async function saveProject(project: Project): Promise<Project> {
  const result = await fetchWithAuth(`/api/projects/${project.id}`, {
    method: 'PATCH',
    body: JSON.stringify(project),
  });
  const saved = result.data as Project;
  // Update caches
  projectCache.set(project.id, { project: saved, cachedAt: Date.now() });
  listCache = null;
  return saved;
}

/**
 * Sync is now the same as save — kept for backward compatibility with
 * callers that use `syncProject`.
 */
export async function syncProject(id: string): Promise<Project | null> {
  // No-op if no cached project to sync from
  const cached = projectCache.get(id);
  if (!cached) return null;
  try {
    const saved = await saveProject(cached.project);
    return saved;
  } catch (error) {
    console.warn('Failed to sync project to API:', error);
    return cached.project;
  }
}

export async function createProject(input: ProjectCreateInput): Promise<Project> {
  const result = await fetchWithAuth('/api/projects', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  const project = result.data as Project;
  // Update caches
  projectCache.set(project.id, { project, cachedAt: Date.now() });
  invalidateListCache();
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
  projectCache.set(id, { project: updated, cachedAt: Date.now() });
  listCache = null;
  return updated;
}

/**
 * Kept for backward compatibility — now just calls updateProjectRemote.
 */
export async function updateProjectLocal(id: string, updates: ProjectUpdateInput): Promise<Project | null> {
  return updateProjectRemote(id, updates);
}

export async function deleteProject(id: string): Promise<void> {
  await fetchWithAuth(`/api/projects/${id}`, { method: 'DELETE' });
  invalidateProjectCache(id);
  invalidateListCache();
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
  projectCache.set(created.id, { project: created, cachedAt: Date.now() });
  invalidateListCache();
  return created;
}

export async function renameProject(id: string, newName: string): Promise<void> {
  const trimmed = newName.trim();
  if (!trimmed) return;
  await updateProjectRemote(id, { name: trimmed });
}

/** No-op — kept for backward compatibility with callers that import it. */
export async function canSyncProject(_id: string): Promise<boolean> {
  return false;
}

/** No-op — kept for backward compatibility. The mirror recovery system is gone. */
export async function recoverFromMirror(): Promise<void> {
  return;
}
