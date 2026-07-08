import type { ExportedItem, PdfProject, ExportType } from '@/types';
import { kvStorage } from '@/lib/utils/kv-storage';
import { generateId } from '@/lib/utils/id';

const EXPORTS_KEY = 'manasik:exports';
const PDF_PROJECTS_KEY = 'manasik:pdf_projects';
const MAX_EXPORTS = 30;

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

// PDF Projects
export async function listPdfProjects(): Promise<PdfProject[]> {
  try {
    const data = await kvStorage.getItem<PdfProject[]>(PDF_PROJECTS_KEY);
    return data || [];
  } catch (error) {
    console.error('Failed to list PDF projects:', error);
    return [];
  }
}

export async function getPdfProject(id: string): Promise<PdfProject | null> {
  try {
    const projects = await listPdfProjects();
    return projects.find(p => p.id === id) || null;
  } catch (error) {
    console.error('Failed to get PDF project:', error);
    return null;
  }
}

export async function savePdfProject(project: PdfProject): Promise<void> {
  try {
    const projects = await listPdfProjects();
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
  } catch (error) {
    console.error('Failed to save PDF project:', error);
    throw error;
  }
}

export async function createPdfProject(name: string, images: string[]): Promise<PdfProject> {
  const project: PdfProject = {
    id: generateId(),
    name,
    images,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    localModifiedAt: Date.now(),
    syncStatus: 'pending'
  };

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
    const projects = await listPdfProjects();
    const filtered = projects.filter(p => p.id !== id);
    await kvStorage.setItem(PDF_PROJECTS_KEY, filtered);
  } catch (error) {
    console.error('Failed to delete PDF project:', error);
    throw error;
  }
}

export async function renamePdfProject(id: string, newName: string): Promise<void> {
  const trimmed = newName.trim();
  if (!trimmed) return;

  await updatePdfProject(id, { name: trimmed });
}