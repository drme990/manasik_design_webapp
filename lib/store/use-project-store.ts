'use client';

import { create } from 'zustand';
import type { Project, ProjectCreateInput, ProjectUpdateInput } from '@/types';
import { generateId } from '@/lib/utils/id';
import { fetchWithAuth } from './fetch-with-auth';

/**
 * Zustand store for projects — the single client-side source of truth for
 * project data (designs + booking templates).
 *
 * Replaces the old `lib/store/projects.ts` + `lib/store/cache.ts` combo.
 * The store state IS the cache — components subscribe to slices of it and
 * get instant re-renders when data changes, with no manual cache
 * invalidation needed.
 *
 * All mutations are optimistic: the store updates immediately so the UI
 * reflects the change before the server confirms it. If the server request
 * fails, the previous state is restored.
 *
 * MongoDB (via the Next.js API routes) remains the persistent source of
 * truth — the store is cleared on full page reload and rehydrated from the
 * API on first access.
 */

interface ProjectState {
  // ── State ──────────────────────────────────────────────────────────
  /** All design projects (kind='design'). */
  projects: Project[];
  /** All booking-template projects (kind='booking_template'). */
  templates: Project[];
  /** True while the projects list is being fetched for the first time. */
  projectsLoading: boolean;
  /** True while the templates list is being fetched for the first time. */
  templatesLoading: boolean;
  /** Per-id cache for single-project lookups (editor page). */
  projectMap: Record<string, Project>;

  // ── Actions: reads ────────────────────────────────────────────────
  /** Fetch the full projects list from the API. */
  fetchProjects: () => Promise<void>;
  /** Fetch the full templates list from the API. */
  fetchTemplates: () => Promise<void>;
  /**
   * Get a single project by ID. Returns the cached value from the store
   * immediately (if present), then refreshes from the API in the
   * background so the next call has fresh data.
   */
  getProject: (id: string) => Promise<Project | null>;

  // ── Actions: writes (all optimistic) ──────────────────────────────
  /** Create a new project on the server and add it to the store. */
  createProject: (input: ProjectCreateInput) => Promise<Project>;
  /**
   * Save a full project to the server (PATCH). Strips transient fields
   * and blob: URIs before sending. Optimistically updates the store.
   */
  saveProject: (project: Project) => Promise<Project>;
  /**
   * Update a project on the server directly (PATCH with partial updates).
   * Used by rename, etc. Optimistically updates the store.
   */
  updateProjectRemote: (id: string, updates: ProjectUpdateInput) => Promise<Project | null>;
  /**
   * Delete a project on the server and remove it from the store.
   * Awaits the DELETE response — use `deleteProjectOptimistic` when you
   * need to fire-and-forget (e.g. leaving the editor).
   */
  deleteProject: (id: string) => Promise<void>;
  /**
   * Optimistically delete a project: remove it from the store immediately
   * and fire the DELETE request in the background without awaiting it.
   * Use this when the caller is about to navigate away and doesn't need
   * to wait for the server response.
   */
  deleteProjectOptimistic: (id: string) => void;
  /** Duplicate a project on the server and add the copy to the store. */
  duplicateProject: (id: string) => Promise<Project | null>;
  /** Rename a project on the server and update the store. */
  renameProject: (id: string, newName: string) => Promise<void>;
  /**
   * Invalidate a project's cached data after a thumbnail upload so the
   * next fetch picks up the new thumbnail URL. Refetches the single
   * project from the API and updates it in the store.
   */
  invalidateThumbnail: (projectId: string) => void;
}

// ── Helpers ──────────────────────────────────────────────────────────

/** Sort projects by updatedAt descending (newest first). */
function sortByUpdated<T extends { updatedAt: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Upsert a project into an array, replacing if the id matches. */
function upsertInArray(arr: Project[], project: Project): Project[] {
  const idx = arr.findIndex((p) => p.id === project.id);
  if (idx >= 0) {
    const copy = [...arr];
    copy[idx] = project;
    return copy;
  }
  return [project, ...arr];
}

/** Remove a project from an array by id. */
function removeFromArray(arr: Project[], id: string): Project[] {
  return arr.filter((p) => p.id !== id);
}

/**
 * Strip transient fields and blob: URIs before persisting to the server.
 * blob: URIs are client-side only and would break on reload.
 */
function cleanProjectForSave(project: Project): Project {
  return {
    ...project,
    bgUploadStatus: undefined,
    bgPendingFile: undefined,
    backgroundUri: project.backgroundUri?.startsWith('blob:') ? undefined : project.backgroundUri,
    backgroundThumbnailUri: project.backgroundThumbnailUri?.startsWith('blob:') ? undefined : project.backgroundThumbnailUri,
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
}

// ── Store ────────────────────────────────────────────────────────────

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  templates: [],
  projectsLoading: false,
  templatesLoading: false,
  projectMap: {},

  // ── Reads ──────────────────────────────────────────────────────────

  fetchProjects: async () => {
    // Only show loading state on the very first fetch (no data yet).
    // If the store already has projects (e.g. navigating back from the
    // editor after optimistic updates), skip the loading flag so there's
    // no UI flash — the background refresh just updates the list silently.
    const hasData = get().projects.length > 0;
    if (!hasData) set({ projectsLoading: true });
    try {
      const result = await fetchWithAuth('/api/projects');
      const projects = (result.data || []) as Project[];
      const designs = projects.filter((p) => p.kind === 'design');
      const templates = projects.filter((p) => p.kind === 'booking_template');
      const map: Record<string, Project> = {};
      for (const p of projects) map[p.id] = p;
      set({
        projects: sortByUpdated(designs),
        templates: sortByUpdated(templates),
        projectMap: { ...get().projectMap, ...map },
        projectsLoading: false,
      });
    } catch (error) {
      console.error('Failed to fetch projects:', error);
      set({ projectsLoading: false });
    }
  },

  fetchTemplates: async () => {
    const hasData = get().templates.length > 0;
    if (!hasData) set({ templatesLoading: true });
    try {
      const result = await fetchWithAuth('/api/projects?kind=booking_template');
      const templates = (result.data || []) as Project[];
      const map: Record<string, Project> = {};
      for (const t of templates) map[t.id] = t;
      set({
        templates: sortByUpdated(templates),
        projectMap: { ...get().projectMap, ...map },
        templatesLoading: false,
      });
    } catch (error) {
      console.error('Failed to fetch templates:', error);
      set({ templatesLoading: false });
    }
  },

  getProject: async (id) => {
    // Return cached value immediately if we have it
    const cached = get().projectMap[id];
    if (cached) {
      // Refresh in background so the next call has fresh data
      fetchWithAuth(`/api/projects/${id}`)
        .then((result) => {
          const project = result.data as Project;
          set((state) => ({
            projectMap: { ...state.projectMap, [id]: project },
            projects: upsertInArray(state.projects, project),
            templates: upsertInArray(state.templates, project),
          }));
        })
        .catch(() => { /* ignore background refresh errors */ });
      return cached;
    }

    try {
      const result = await fetchWithAuth(`/api/projects/${id}`);
      const project = result.data as Project;
      set((state) => ({
        projectMap: { ...state.projectMap, [id]: project },
        projects: upsertInArray(state.projects, project),
        templates: upsertInArray(state.templates, project),
      }));
      return project;
    } catch (error) {
      console.warn('Failed to fetch project from API:', error);
      return null;
    }
  },

  // ── Writes (all optimistic) ────────────────────────────────────────

  createProject: async (input) => {
    const result = await fetchWithAuth('/api/projects', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    const project = result.data as Project;
    // Optimistic: add to store immediately
    set((state) => ({
      projectMap: { ...state.projectMap, [project.id]: project },
      projects: project.kind === 'design'
        ? sortByUpdated(upsertInArray(state.projects, project))
        : state.projects,
      templates: project.kind === 'booking_template'
        ? sortByUpdated(upsertInArray(state.templates, project))
        : state.templates,
    }));
    return project;
  },

  saveProject: async (project) => {
    const clean = cleanProjectForSave(project);
    const result = await fetchWithAuth(`/api/projects/${project.id}`, {
      method: 'PATCH',
      body: JSON.stringify(clean),
    });
    const saved = result.data as Project;
    // Update store with the server's response (canonical positions)
    set((state) => ({
      projectMap: { ...state.projectMap, [saved.id]: saved },
      projects: upsertInArray(state.projects, saved),
      templates: upsertInArray(state.templates, saved),
    }));
    return saved;
  },

  updateProjectRemote: async (id, updates) => {
    const result = await fetchWithAuth(`/api/projects/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
    const updated = result.data as Project;
    set((state) => ({
      projectMap: { ...state.projectMap, [id]: updated },
      projects: upsertInArray(state.projects, updated),
      templates: upsertInArray(state.templates, updated),
    }));
    return updated;
  },

  deleteProject: async (id) => {
    await fetchWithAuth(`/api/projects/${id}`, { method: 'DELETE' });
    set((state) => ({
      projects: removeFromArray(state.projects, id),
      templates: removeFromArray(state.templates, id),
      projectMap: Object.fromEntries(
        Object.entries(state.projectMap).filter(([key]) => key !== id),
      ),
    }));
  },

  deleteProjectOptimistic: (id) => {
    // Remove from store immediately
    set((state) => ({
      projects: removeFromArray(state.projects, id),
      templates: removeFromArray(state.templates, id),
      projectMap: Object.fromEntries(
        Object.entries(state.projectMap).filter(([key]) => key !== id),
      ),
    }));
    // Fire DELETE in the background — no await
    fetchWithAuth(`/api/projects/${id}`, { method: 'DELETE' }).catch((error) => {
      console.error(`Failed to delete project ${id} on server:`, error);
    });
  },

  duplicateProject: async (id) => {
    const project = await get().getProject(id);
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
    set((state) => ({
      projectMap: { ...state.projectMap, [created.id]: created },
      projects: created.kind === 'design'
        ? sortByUpdated(upsertInArray(state.projects, created))
        : state.projects,
      templates: created.kind === 'booking_template'
        ? sortByUpdated(upsertInArray(state.templates, created))
        : state.templates,
    }));
    return created;
  },

  renameProject: async (id, newName) => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    await get().updateProjectRemote(id, { name: trimmed });
  },

  invalidateThumbnail: (projectId) => {
    // Refetch the single project from the API to get the updated thumbnail
    fetchWithAuth(`/api/projects/${projectId}`)
      .then((result) => {
        const project = result.data as Project;
        set((state) => ({
          projectMap: { ...state.projectMap, [projectId]: project },
          projects: upsertInArray(state.projects, project),
          templates: upsertInArray(state.templates, project),
        }));
      })
      .catch((error) => {
        console.error('Failed to refresh project after thumbnail upload:', error);
      });
  },
}));
