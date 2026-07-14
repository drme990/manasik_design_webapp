import type { Project, ProjectCreateInput, ProjectUpdateInput } from '@/types';
import { kvStorage } from '@/lib/utils/kv-storage';
import { generateId } from '@/lib/utils/id';

const STORAGE_KEY = 'manasik:projects';
const SYNC_INTERVAL_MS = 10_000;

let lastSyncTime = 0;

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

export async function listProjects(): Promise<Project[]> {
  try {
    const result = await fetchWithAuth('/api/projects');
    const projects = (result.data || []) as Project[];
    await kvStorage.setItem(STORAGE_KEY, projects);
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
  try {
    const result = await fetchWithAuth(`/api/projects/${id}`);
    const remoteProject = result.data as Project;
    const localProject = (await kvStorage.getItem<Project[]>(STORAGE_KEY) || []).find((p) => p.id === id);

    const shouldPreferLocal = localProject &&
      localProject.localModifiedAt > (remoteProject.localModifiedAt || 0) &&
      localProject.syncStatus === 'pending';

    const project = shouldPreferLocal ? localProject : remoteProject;
    await mergeLocalProject(project);
    return project;
  } catch (error) {
    console.warn('Failed to fetch project from API, falling back to local cache:', error);
    const projects = await listProjects();
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
}
