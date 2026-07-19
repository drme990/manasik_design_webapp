import type { ExportedItem, PdfProject, PdfImage, ExportType } from '@/types';
import { kvStorage } from '@/lib/utils/kv-storage';
import { generateId } from '@/lib/utils/id';

const EXPORTS_KEY = 'manasik:exports';
const PDF_PROJECTS_KEY = 'manasik:pdf_projects';
const PDF_PROJECTS_API = '/api/pdf-projects';
const MAX_EXPORTS = 30;

// ─── In-memory cache for PDF projects ────────────────────────────────────────
let pdfListCache: { projects: PdfProject[]; cachedAt: number } | null = null;
const PDF_CACHE_TTL_MS = 30_000;

export function invalidatePdfListCache(): void {
  pdfListCache = null;
}

export async function listExports(): Promise<ExportedItem[]> {
  try {
    const data = await kvStorage.getItem<ExportedItem[]>(EXPORTS_KEY);
    return data || [];
  } catch (error) {
    console.error('Failed to list exports:', error);
    return [];
  }
}

export async function addExport(exportItem: Omit<ExportedItem, 'id' | 'createdAt' | 'localModifiedAt' | 'syncStatus' | 'uri' | 'type'> & { uri: string; type: ExportType }): Promise<ExportedItem> {
  try {
    const exports = await listExports();

    const newItem: ExportedItem = {
      ...exportItem,
      id: generateId(),
      createdAt: Date.now(),
      localModifiedAt: Date.now(),
      syncStatus: 'pending'
    };

    // Add to beginning and keep only MAX_EXPORTS
    const updated = [newItem, ...exports].slice(0, MAX_EXPORTS);
    await kvStorage.setItem(EXPORTS_KEY, updated);

    return newItem;
  } catch (error) {
    console.error('Failed to add export:', error);
    throw error;
  }
}

export async function deleteExport(id: string): Promise<void> {
  try {
    const exports = await listExports();
    const filtered = exports.filter(e => e.id !== id);
    await kvStorage.setItem(EXPORTS_KEY, filtered);
  } catch (error) {
    console.error('Failed to delete export:', error);
    throw error;
  }
}

export async function clearOldExports(): Promise<void> {
  try {
    const exports = await listExports();
    if (exports.length <= MAX_EXPORTS) return;

    const trimmed = exports.slice(0, MAX_EXPORTS);
    await kvStorage.setItem(EXPORTS_KEY, trimmed);
  } catch (error) {
    console.error('Failed to clear old exports:', error);
  }
}

// PDF Projects — synced with API
export async function listPdfProjects(): Promise<PdfProject[]> {
  // Return cached list if fresh
  if (pdfListCache && Date.now() - pdfListCache.cachedAt < PDF_CACHE_TTL_MS) {
    return pdfListCache.projects;
  }

  try {
    const response = await fetch(PDF_PROJECTS_API, { credentials: 'same-origin' });
    if (response.ok) {
      const result = await response.json();
      const projects = (result.data || []) as PdfProject[];
      await kvStorage.setItem(PDF_PROJECTS_KEY, projects);
      pdfListCache = { projects, cachedAt: Date.now() };
      return projects;
    }
    throw new Error(`HTTP ${response.status}`);
  } catch (error) {
    console.warn('Failed to fetch PDF projects from API, falling back to local cache:', error);
    const data = await kvStorage.getItem<PdfProject[]>(PDF_PROJECTS_KEY);
    return data || [];
  }
}

export async function getPdfProject(id: string): Promise<PdfProject | null> {
  try {
    const response = await fetch(`${PDF_PROJECTS_API}/${id}`, { credentials: 'same-origin' });
    if (response.ok) {
      const result = await response.json();
      return result.data as PdfProject;
    }
  } catch (error) {
    console.warn('Failed to fetch PDF project from API, falling back to local:', error);
  }
  const projects = await kvStorage.getItem<PdfProject[]>(PDF_PROJECTS_KEY) || [];
  return projects.find(p => p.id === id) || null;
}

export async function savePdfProject(project: PdfProject): Promise<void> {
  try {
    const projects = await kvStorage.getItem<PdfProject[]>(PDF_PROJECTS_KEY) || [];
    const index = projects.findIndex(p => p.id === project.id);

    const updatedProject = {
      ...project,
      updatedAt: Date.now(),
      localModifiedAt: Date.now(),
      syncStatus: 'pending' as const
    };

    if (index >= 0) {
      projects[index] = updatedProject;
    } else {
      projects.push(updatedProject);
    }

    await kvStorage.setItem(PDF_PROJECTS_KEY, projects);
    invalidatePdfListCache();

    // Sync to API (fire and forget — local save is the source of truth)
    syncPdfProjectToApi(updatedProject).catch((err) =>
      console.warn('Failed to sync PDF project to API:', err)
    );
  } catch (error) {
    console.error('Failed to save PDF project:', error);
    throw error;
  }
}

async function syncPdfProjectToApi(project: PdfProject): Promise<void> {
  const response = await fetch(`${PDF_PROJECTS_API}/${project.id}`, {
    method: 'PATCH',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(project),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
}

export async function createPdfProject(name: string, images: PdfImage[]): Promise<PdfProject> {
  const project: PdfProject = {
    id: generateId(),
    name,
    images,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    localModifiedAt: Date.now(),
    syncStatus: 'pending'
  };

  // Try creating on API first
  try {
    const response = await fetch(PDF_PROJECTS_API, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, images }),
    });
    if (response.ok) {
      const result = await response.json();
      const created = result.data as PdfProject;
      // Save locally too
      const projects = await kvStorage.getItem<PdfProject[]>(PDF_PROJECTS_KEY) || [];
      projects.push(created);
      await kvStorage.setItem(PDF_PROJECTS_KEY, projects);
      invalidatePdfListCache();
      return created;
    }
  } catch (error) {
    console.warn('Failed to create PDF project on API, creating locally only:', error);
  }

  // Fallback: local only
  await savePdfProject(project);
  return project;
}

export async function updatePdfProject(id: string, updates: Partial<PdfProject>): Promise<PdfProject | null> {
  const project = await getPdfProject(id);
  if (!project) return null;

  const updated = {
    ...project,
    ...updates,
    id,
    localModifiedAt: Date.now(),
    syncStatus: 'pending' as const
  };

  await savePdfProject(updated);
  return updated;
}

export async function deletePdfProject(id: string): Promise<void> {
  try {
    await fetch(`${PDF_PROJECTS_API}/${id}`, {
      method: 'DELETE',
      credentials: 'same-origin',
    });
  } catch (error) {
    console.warn('Failed to delete PDF project from API:', error);
  }

  const projects = await kvStorage.getItem<PdfProject[]>(PDF_PROJECTS_KEY) || [];
  const filtered = projects.filter(p => p.id !== id);
  await kvStorage.setItem(PDF_PROJECTS_KEY, filtered);
  invalidatePdfListCache();
}

export async function renamePdfProject(id: string, newName: string): Promise<void> {
  const trimmed = newName.trim();
  if (!trimmed) return;

  await updatePdfProject(id, { name: trimmed });
}