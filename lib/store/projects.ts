import type { Project, ProjectCreateInput, ProjectUpdateInput } from '@/types';
import { kvStorage } from '@/lib/utils/kv-storage';
import { generateId } from '@/lib/utils/id';

const STORAGE_KEY = 'manasik:projects';

export async function listProjects(): Promise<Project[]> {
  try {
    const data = await kvStorage.getItem<Project[]>(STORAGE_KEY);
    return data || [];
  } catch (error) {
    console.error('Failed to list projects:', error);
    return [];
  }
}

export async function listAllProjects(): Promise<Project[]> {
  return listProjects();
}

export async function listBookingTemplateProjects(): Promise<Project[]> {
  const projects = await listProjects();
  return projects.filter(p => p.kind === 'booking_template');
}

export async function getProject(id: string): Promise<Project | null> {
  try {
    const projects = await listProjects();
    return projects.find(p => p.id === id) || null;
  } catch (error) {
    console.error('Failed to get project:', error);
    return null;
  }
}

export async function saveProject(project: Project): Promise<void> {
  try {
    const projects = await listProjects();
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

    await kvStorage.setItem(STORAGE_KEY, projects);
  } catch (error) {
    console.error('Failed to save project:', error);
    throw error;
  }
}

export async function createProject(input: ProjectCreateInput): Promise<Project> {
  const project: Project = {
    id: generateId(),
    name: input.name,
    kind: input.kind,
    canvasWidth: input.canvasWidth,
    canvasHeight: input.canvasHeight,
    backgroundUri: input.backgroundUri,
    layers: [],
    bookingMeta: input.bookingMeta,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    localModifiedAt: Date.now(),
    syncStatus: 'pending',
    userId: input.userId
  };

  await saveProject(project);
  return project;
}

export async function updateProject(id: string, updates: ProjectUpdateInput): Promise<Project | null> {
  const project = await getProject(id);
  if (!project) return null;

  const updated = {
    ...project,
    ...updates,
    id, // Ensure ID doesn't change
    localModifiedAt: Date.now(),
    syncStatus: 'pending' as const
  };

  await saveProject(updated);
  return updated;
}

export async function deleteProject(id: string): Promise<void> {
  try {
    const projects = await listProjects();
    const filtered = projects.filter(p => p.id !== id);
    await kvStorage.setItem(STORAGE_KEY, filtered);
  } catch (error) {
    console.error('Failed to delete project:', error);
    throw error;
  }
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
    layers: project.layers.map(layer => ({
      ...layer,
      id: generateId()
    }))
  };

  await saveProject(duplicated);
  return duplicated;
}

export async function renameProject(id: string, newName: string): Promise<void> {
  const trimmed = newName.trim();
  if (!trimmed) return;

  await updateProject(id, { name: trimmed });
}