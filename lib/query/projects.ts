import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import type {
  Project,
  ProjectCreateInput,
  ProjectSummary,
  ProjectUpdateInput,
  TemplateApp,
} from '@/types';
import { fetchWithAuth } from '@/lib/store/fetch-with-auth';
import { DEFAULT_STALE_TIME, getQueryClient, queryKeys } from './client';

/**
 * Project data access — designs + booking templates.
 *
 * The shared TanStack Query client is the single client-side cache:
 * list queries hold `ProjectSummary[]` (no `layers`), item queries hold
 * full `Project` docs. Summary docs are NEVER written to the item cache —
 * the editor always receives a full document via `getProject`.
 *
 * Components read lists via `useDesigns`/`useTemplates`; imperative
 * callers use `getProject` and the mutation functions below. Every
 * mutation writes through to the cache (`setQueryData`) so subscribers
 * update instantly without a refetch.
 */

// ── Fetchers (raw HTTP) ────────────────────────────────────────────────

export async function fetchDesignSummaries(): Promise<ProjectSummary[]> {
  const result = await fetchWithAuth('/api/projects?summary=1');
  return (result.data || []) as ProjectSummary[];
}

export async function fetchTemplateSummaries(): Promise<ProjectSummary[]> {
  const result = await fetchWithAuth('/api/projects?kind=booking_template&summary=1');
  return (result.data || []) as ProjectSummary[];
}

export async function fetchProject(id: string): Promise<Project> {
  const result = await fetchWithAuth(`/api/projects/${id}`);
  return result.data as Project;
}

// ── Hooks ──────────────────────────────────────────────────────────────

/**
 * User designs list (kind='design'). Accepts SSR-provided initial data —
 * on `/` the server component already queried MongoDB, so the first
 * paint ships real cards with zero client fetch.
 *
 * `seededAt` is captured once per mount: the SSR payload is fresh at
 * mount time, but a per-render `Date.now()` would let stale props
 * clobber mutations made after mounting.
 *
 * `seedIsPartial` — the SSR seed is bounded (DESIGN_SEED_LIMIT) to keep
 * the RSC payload small. When partial, the seed is backdated past
 * staleTime so the query refetches the FULL list in the background on
 * mount — instant paint from the seed, complete data moments later.
 */
export function useDesigns(initialData?: ProjectSummary[], seedIsPartial = false) {
  const [seededAt] = useState(() => Date.now());
  return useQuery({
    queryKey: queryKeys.designsList,
    queryFn: fetchDesignSummaries,
    initialData,
    initialDataUpdatedAt: initialData
      ? seedIsPartial
        ? seededAt - DEFAULT_STALE_TIME - 1
        : seededAt
      : undefined,
    select: sortByUpdated,
  });
}

/** Booking templates list (kind='booking_template'). */
export function useTemplates() {
  return useQuery({
    queryKey: queryKeys.templatesList,
    queryFn: fetchTemplateSummaries,
    select: sortByUpdated,
  });
}

/**
 * Get a full project doc (editor use). Returns the cached doc when fresh,
 * refetches when stale — the editor always works on current data.
 */
export async function getProject(id: string): Promise<Project | null> {
  try {
    return await getQueryClient().fetchQuery({
      queryKey: queryKeys.project(id),
      queryFn: () => fetchProject(id),
    });
  } catch (error) {
    console.warn('Failed to fetch project from API:', error);
    return null;
  }
}

// ── Cache helpers ──────────────────────────────────────────────────────

/** Sort by updatedAt descending (newest first). */
function sortByUpdated<T extends { updatedAt: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => b.updatedAt - a.updatedAt);
}

function upsertInArray(arr: ProjectSummary[], project: ProjectSummary): ProjectSummary[] {
  const idx = arr.findIndex((p) => p.id === project.id);
  if (idx >= 0) {
    const copy = [...arr];
    copy[idx] = project;
    return copy;
  }
  return [project, ...arr];
}

/**
 * Write a full project into the item cache AND the list matching its
 * `kind`. Kind-aware — a template/order-design can never leak into the
 * user-designs list. Lists that were never fetched stay untouched (a
 * partial list is worse than no list).
 */
function upsertProjectEverywhere(qc: QueryClient, project: Project): void {
  qc.setQueryData(queryKeys.project(project.id), project);
  const listKey =
    project.kind === 'design'
      ? queryKeys.designsList
      : project.kind === 'booking_template'
        ? queryKeys.templatesList
        : null;
  if (!listKey) return;
  qc.setQueryData<ProjectSummary[]>(listKey, (old) =>
    old ? sortByUpdated(upsertInArray(old, project)) : old,
  );
}

/** Remove a project from the item cache and every list. */
function removeProjectEverywhere(qc: QueryClient, id: string): void {
  qc.removeQueries({ queryKey: queryKeys.project(id) });
  for (const listKey of [queryKeys.designsList, queryKeys.templatesList]) {
    qc.setQueryData<ProjectSummary[]>(listKey, (old) =>
      old?.filter((p) => p.id !== id),
    );
  }
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

// ── Mutations ──────────────────────────────────────────────────────────

/** Create a project on the server and write it into the cache. */
export async function createProject(input: ProjectCreateInput): Promise<Project> {
  const result = await fetchWithAuth('/api/projects', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  const project = result.data as Project;
  upsertProjectEverywhere(getQueryClient(), project);
  return project;
}

/**
 * Save a full project to the server (PATCH). Strips transient fields and
 * blob: URIs before sending; writes the server's canonical response into
 * the cache.
 */
export async function saveProject(project: Project): Promise<Project> {
  const clean = cleanProjectForSave(project);
  // Convert undefined fields to null so they survive JSON.stringify
  // and actually clear the field in MongoDB ($set). Without this,
  // removing the background image sends no backgroundUri in the PATCH
  // body, so the old value persists in the database.
  const payload = {
    ...clean,
    backgroundUri: clean.backgroundUri ?? null,
    backgroundThumbnailUri: clean.backgroundThumbnailUri ?? null,
  };
  const result = await fetchWithAuth(`/api/projects/${project.id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  const saved = result.data as Project;
  upsertProjectEverywhere(getQueryClient(), saved);

  // If this is an order-generated design, re-render it to JPG and
  // create a new version snapshot. Fire-and-forget — the save itself
  // already succeeded; the re-render just updates the image and records
  // the version. The user is NOT blocked.
  //
  // We pass the saved project data in the request body so the re-render
  // route uses the exact same data that was just PATCHed to MongoDB —
  // no read-after-write race condition.
  //
  // The re-render route updates the order's designUrls directly in the
  // shared MongoDB (no HTTP call to the backend). The admin panel's
  // sync-designs endpoint is a safety net that catches up on window
  // focus if the direct write failed.
  if (saved.kind === 'order_design' && saved.orderDesignUrl) {
    fetchWithAuth(`/api/projects/${saved.id}/re-render`, {
      method: 'POST',
      body: JSON.stringify({ project: saved }),
    }).catch(() => {
      // Best-effort — the save itself succeeded
    });
  }

  return saved;
}

/** PATCH partial updates (rename, appSource, ...) and cache the result. */
export async function updateProjectRemote(id: string, updates: ProjectUpdateInput): Promise<Project | null> {
  const result = await fetchWithAuth(`/api/projects/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
  const updated = result.data as Project;
  upsertProjectEverywhere(getQueryClient(), updated);
  return updated;
}

/** Delete a project on the server and evict it from the cache. */
export async function deleteProject(id: string): Promise<void> {
  await fetchWithAuth(`/api/projects/${id}`, { method: 'DELETE' });
  removeProjectEverywhere(getQueryClient(), id);
}

/**
 * Optimistically delete: evict from cache immediately and fire the
 * DELETE request in the background without awaiting it. Use when the
 * caller is about to navigate away (e.g. leaving the editor).
 */
export function deleteProjectOptimistic(id: string): void {
  removeProjectEverywhere(getQueryClient(), id);
  fetchWithAuth(`/api/projects/${id}`, { method: 'DELETE' }).catch((error) => {
    console.error(`Failed to delete project ${id} on server:`, error);
  });
}

/**
 * Duplicate a project on the server and add the copy to the cache.
 * Uses the dedicated duplicate endpoint so the BG file is copied to a
 * new R2 key owned by the new project — deleting the duplicate can't
 * delete the original's BG.
 */
export async function duplicateProject(id: string): Promise<Project | null> {
  const project = await getProject(id);
  if (!project) return null;

  const result = await fetchWithAuth(`/api/projects/${id}/duplicate`, {
    method: 'POST',
    body: JSON.stringify({
      name: `${project.name} — نسخة`,
    }),
  });
  const created = result.data as Project;
  upsertProjectEverywhere(getQueryClient(), created);
  return created;
}

/**
 * Duplicate a template to a different app (manasik → ghadaq or vice
 * versa). Product connections are copied to the target app's slot
 * server-side — callers should invalidate the booking-products list.
 */
export async function duplicateTemplateToApp(id: string, targetApp: TemplateApp): Promise<Project | null> {
  const project = await getProject(id);
  if (!project) return null;

  const appLabel = targetApp === 'ghadaq' ? 'غدق' : 'مناسك';
  const result = await fetchWithAuth(`/api/projects/${id}/duplicate`, {
    method: 'POST',
    body: JSON.stringify({
      name: `${project.name} — ${appLabel}`,
      appSource: targetApp,
      copyProductConnections: true,
    }),
  });
  const created = result.data as Project;
  upsertProjectEverywhere(getQueryClient(), created);
  return created;
}

/** Rename a project on the server and update the cache. */
export async function renameProject(id: string, newName: string): Promise<void> {
  const trimmed = newName.trim();
  if (!trimmed) return;
  await updateProjectRemote(id, { name: trimmed });
}

/**
 * Refetch a project after a thumbnail upload so the new thumbnail URL
 * propagates to the item cache and lists. Fire-and-forget.
 */
export function invalidateThumbnail(projectId: string): void {
  fetchProject(projectId)
    .then((project) => upsertProjectEverywhere(getQueryClient(), project))
    .catch((error) => {
      console.error('Failed to refresh project after thumbnail upload:', error);
    });
}
