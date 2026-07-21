import type { Project, ProjectCreateInput, ProjectUpdateInput } from '@/types';
import { kvStorage } from '@/lib/utils/kv-storage';
import { generateId } from '@/lib/utils/id';

const STORAGE_KEY = 'manasik:projects';
const LOCAL_STORAGE_KEY = 'manasik:projects:mirror';
const SYNC_INTERVAL_MS = 10_000;

let lastSyncTime = 0;

/**
 * Mirror save to localStorage — synchronous, survives page crashes / mobile
 * app kills where IndexedDB transactions might not flush.
 * Called alongside every IndexedDB save.
 */
function mirrorToLocalStorage(projects: Project[]): void {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(projects));
  } catch {
    // localStorage might be full or unavailable — ignore
  }
}

/**
 * Reads the localStorage mirror. Used on startup to recover data that
 * IndexedDB might have lost (e.g. mobile app was killed mid-transaction).
 */
export function readLocalStorageMirror(): Project[] | null {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Project[];
  } catch {
    return null;
  }
}

/**
 * Merges the localStorage mirror into IndexedDB on startup.
 * For each project, picks the version with the newer localModifiedAt.
 * Clears the mirror after successful merge.
 */
export async function recoverFromMirror(): Promise<void> {
  const mirrored = readLocalStorageMirror();
  if (!mirrored || mirrored.length === 0) return;

  const indexed = await kvStorage.getItem<Project[]>(STORAGE_KEY) || [];
  let changed = false;

  for (const mirroredProject of mirrored) {
    const index = indexed.findIndex((p) => p.id === mirroredProject.id);
    if (index >= 0) {
      if ((mirroredProject.localModifiedAt || 0) > (indexed[index].localModifiedAt || 0)) {
        indexed[index] = mirroredProject;
        changed = true;
      }
    } else {
      indexed.push(mirroredProject);
      changed = true;
    }
  }

  if (changed) {
    await kvStorage.setItem(STORAGE_KEY, indexed);
  }
  // Clear mirror after recovery
  try {
    localStorage.removeItem(LOCAL_STORAGE_KEY);
  } catch {
    // ignore
  }
}

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
// Cache is invalidated when a project is saved or when explicitly invalidated.

const projectCache = new Map<string, { project: Project; cachedAt: number }>();
let listCache: { projects: Project[]; cachedAt: number } | null = null;
const CACHE_TTL_MS = 60_000; // 60 seconds — stale data is fine for UI, but refresh eventually

/** Invalidate the list cache (call after creating/deleting/renaming a project). */
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

  try {
    const result = await fetchWithAuth('/api/projects');
    const projects = (result.data || []) as Project[];

    // Only write to IndexedDB if the data actually changed — avoids an
    // expensive serialization + IDB write on every page visit when the
    // server data matches what we already have.
    const existing = await kvStorage.getItem<Project[]>(STORAGE_KEY);
    const changed = !existing || existing.length !== projects.length ||
      projects.some((p, i) => p.updatedAt !== existing[i]?.updatedAt || p.id !== existing[i]?.id);
    if (changed) {
      await kvStorage.setItem(STORAGE_KEY, projects);
      mirrorToLocalStorage(projects);
    }

    // Update cache
    listCache = { projects, cachedAt: Date.now() };
    // Also update individual project cache
    for (const p of projects) {
      projectCache.set(p.id, { project: p, cachedAt: Date.now() });
    }
    return projects;
  } catch (error) {
    console.warn('Failed to fetch projects from API, falling back to local cache:', error);
    const data = await kvStorage.getItem<Project[]>(STORAGE_KEY);
    return data || [];
  }
}

export async function listAllProjects(): Promise<Project[]> {
  return listProjects();
}

export async function listBookingTemplateProjects(): Promise<Project[]> {
  const projects = await listProjects();
  return projects.filter((p) => p.kind === 'booking_template');
}

export async function loadProject(id: string): Promise<Project | null> {
  // Always fetch from API to get the latest — but use cache as instant fallback
  // for smooth UX while the fetch happens in the background.
  try {
    const result = await fetchWithAuth(`/api/projects/${id}`);
    const remoteProject = result.data as Project;
    const localProject = (await kvStorage.getItem<Project[]>(STORAGE_KEY) || []).find((p) => p.id === id);

    const shouldPreferLocal = localProject &&
      localProject.localModifiedAt > (remoteProject.localModifiedAt || 0) &&
      localProject.syncStatus === 'pending';

    const project = shouldPreferLocal ? localProject : remoteProject;
    await mergeLocalProject(project);
    // Update cache
    projectCache.set(id, { project, cachedAt: Date.now() });
    return project;
  } catch (error) {
    console.warn('Failed to fetch project from API, falling back to local cache:', error);
    // Try in-memory cache first
    const cached = projectCache.get(id);
    if (cached) return cached.project;
    // Then IndexedDB
    const projects = await kvStorage.getItem<Project[]>(STORAGE_KEY) || [];
    return projects.find((p) => p.id === id) || null;
  }
}

export async function getProject(id: string): Promise<Project | null> {
  return loadProject(id);
}

export async function saveProject(project: Project): Promise<void> {
  const projects = await kvStorage.getItem<Project[]>(STORAGE_KEY) || [];
  const index = projects.findIndex((p) => p.id === project.id);

  const updatedProject = {
    ...project,
    updatedAt: Date.now(),
    localModifiedAt: Date.now(),
    syncStatus: 'pending' as const,
  };

  if (index >= 0) {
    projects[index] = updatedProject;
  } else {
    projects.push(updatedProject);
  }

  await kvStorage.setItem(STORAGE_KEY, projects);
  // Mirror to localStorage as a safety net
  mirrorToLocalStorage(projects);
  // Update in-memory cache so the next loadProject returns fresh data
  projectCache.set(project.id, { project: updatedProject, cachedAt: Date.now() });
  // Invalidate list cache so the projects page shows updated timestamps
  listCache = null;
}


export async function syncProject(id: string): Promise<Project | null> {
  let project = (await kvStorage.getItem<Project[]>(STORAGE_KEY) || []).find((p) => p.id === id);
  if (!project) return null;
  if (project.syncStatus !== 'pending') return project;

  const sentAt = project.localModifiedAt;

  try {
    const result = await fetchWithAuth(`/api/projects/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(project),
    });

    project = (await kvStorage.getItem<Project[]>(STORAGE_KEY) || []).find((p) => p.id === id) || project;
    if (project.localModifiedAt > sentAt) {
      return project;
    }

    const syncedProject = {
      ...result.data,
      localModifiedAt: project.localModifiedAt,
      syncStatus: 'synced' as const,
      syncedAt: Date.now(),
    };
    await mergeLocalProject(syncedProject);
    // Update cache with synced version
    projectCache.set(id, { project: syncedProject, cachedAt: Date.now() });
    listCache = null; // Invalidate list so projects page refreshes
    lastSyncTime = Date.now();
    return syncedProject;
  } catch (error) {
    console.warn('Failed to sync project to API:', error);
    return project;
  }
}

export async function createProject(input: ProjectCreateInput): Promise<Project> {
  try {
    const result = await fetchWithAuth('/api/projects', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    const project = result.data as Project;
    await mergeLocalProject(project);
    invalidateListCache();
    return project;
  } catch (error) {
    console.warn('Failed to create project on API, creating locally only:', error);
    const project: Project = {
      id: generateId(),
      name: input.name,
      kind: input.kind,
      canvasWidth: input.canvasWidth,
      canvasHeight: input.canvasHeight,
      backgroundColor: input.backgroundColor ?? '#ffffff',
      backgroundUri: input.backgroundUri,
      layers: [],
      bookingMeta: input.bookingMeta,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      localModifiedAt: Date.now(),
      syncStatus: 'pending',
      userId: input.userId,
    };
    await saveProject(project);
    return project;
  }
}

export async function updateProjectLocal(id: string, updates: ProjectUpdateInput): Promise<Project | null> {
  const project = await getProject(id);
  if (!project) return null;

  const updated = {
    ...project,
    ...updates,
    id,
    localModifiedAt: Date.now(),
    syncStatus: 'pending' as const,
  };

  await saveProject(updated);
  return updated;
}

export async function deleteProject(id: string): Promise<void> {
  try {
    await fetchWithAuth(`/api/projects/${id}`, {
      method: 'DELETE',
    });
  } catch (error) {
    console.warn('Failed to delete project from API, deleting locally only:', error);
  }

  const projects = await kvStorage.getItem<Project[]>(STORAGE_KEY) || [];
  const filtered = projects.filter((p) => p.id !== id);
  await kvStorage.setItem(STORAGE_KEY, filtered);
  mirrorToLocalStorage(filtered);
  invalidateProjectCache(id);
  invalidateListCache();
}

export async function duplicateProject(id: string): Promise<Project | null> {
  const project = await getProject(id);
  if (!project) return null;

  const duplicated: Project = {
    ...project,
    id: generateId(),
    name: `${project.name} — نسخة`,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    localModifiedAt: Date.now(),
    syncStatus: 'pending' as const,
    layers: project.layers.map((layer) => ({
      ...layer,
      id: generateId(),
    })),
  };

  try {
    const result = await fetchWithAuth('/api/projects', {
      method: 'POST',
      body: JSON.stringify({
        name: duplicated.name,
        kind: duplicated.kind,
        canvasWidth: duplicated.canvasWidth,
        canvasHeight: duplicated.canvasHeight,
        backgroundColor: duplicated.backgroundColor,
        backgroundUri: duplicated.backgroundUri,
        layers: duplicated.layers,
        bookingMeta: duplicated.bookingMeta,
      } as ProjectCreateInput),
    });
    const created = result.data as Project;
    await mergeLocalProject(created);
    invalidateListCache();
    return created;
  } catch (error) {
    console.warn('Failed to duplicate project on API, duplicating locally only:', error);
    await saveProject(duplicated);
    return duplicated;
  }
}

export async function renameProject(id: string, newName: string): Promise<void> {
  const trimmed = newName.trim();
  if (!trimmed) return;
  await updateProjectLocal(id, { name: trimmed });
  await syncProject(id);
}

export async function canSyncProject(id: string): Promise<boolean> {
  const project = (await kvStorage.getItem<Project[]>(STORAGE_KEY) || []).find((p) => p.id === id);
  if (!project) return false;
  if (project.syncStatus !== 'pending') return false;
  return Date.now() - lastSyncTime >= SYNC_INTERVAL_MS;
}

async function mergeLocalProject(project: Project): Promise<void> {
  const projects = await kvStorage.getItem<Project[]>(STORAGE_KEY) || [];
  const index = projects.findIndex((p) => p.id === project.id);
  if (index >= 0) {
    projects[index] = project;
  } else {
    projects.push(project);
  }
  await kvStorage.setItem(STORAGE_KEY, projects);
  mirrorToLocalStorage(projects);
}


