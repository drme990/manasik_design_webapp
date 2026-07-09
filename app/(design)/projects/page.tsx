'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { LuPlus, LuImageOff, LuEllipsisVertical, LuPencil, LuTrash2, LuEye } from 'react-icons/lu';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { EmptyState } from '@/components/ui/EmptyState';
import Modal from '@/components/ui/Modal';
import AlertDialog from '@/components/ui/AlertDialog';
import ProjectCardPreview from '@/components/projects/ProjectCardPreview';
import { listProjects, createProject, deleteProject, renameProject } from '@/lib/store/projects';
import type { Project } from '@/types';

const PRESETS = [
  { name: 'Square', width: 1080, height: 1080 },
  { name: 'Story', width: 1080, height: 1920 },
  { name: 'Post', width: 1200, height: 1500 },
];

export default function ProjectsPage() {
  const t = useTranslations('projects');
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [menuProjectId, setMenuProjectId] = useState<string | null>(null);
  const [renameProjectId, setRenameProjectId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deleteProjectId, setDeleteProjectId] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [previewProject, setPreviewProject] = useState<Project | null>(null);
  const [customOpen, setCustomOpen] = useState(false);
  const [customWidth, setCustomWidth] = useState('1080');
  const [customHeight, setCustomHeight] = useState('1080');
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listProjects().then((data) => {
      const sorted = [...data].sort((a, b) => b.updatedAt - a.updatedAt);
      setProjects(sorted);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuProjectId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleCreate = async (preset: typeof PRESETS[number]) => {
    const project = await createProject({
      name: `${preset.name} — ${new Date().toLocaleDateString()}`,
      kind: 'design',
      canvasWidth: preset.width,
      canvasHeight: preset.height,
    });
    window.location.href = `/editor/${project.id}`;
  };

  const handleCreateCustom = async () => {
    const width = Number(customWidth);
    const height = Number(customHeight);
    if (width <= 0 || height <= 0) return;
    const project = await createProject({
      name: `${t('custom')} — ${width}×${height}`,
      kind: 'design',
      canvasWidth: width,
      canvasHeight: height,
    });
    setCustomOpen(false);
    window.location.href = `/editor/${project.id}`;
  };

  const handleOpenMenu = (e: React.MouseEvent, projectId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setMenuProjectId((prev) => (prev === projectId ? null : projectId));
  };

  const handleOpenRename = (e: React.MouseEvent, project: Project) => {
    e.preventDefault();
    e.stopPropagation();
    setMenuProjectId(null);
    setRenameProjectId(project.id);
    setRenameValue(project.name);
  };

  const handleRename = async () => {
    if (!renameProjectId || !renameValue.trim()) return;
    await renameProject(renameProjectId, renameValue.trim());
    setProjects((prev) =>
      prev.map((p) => (p.id === renameProjectId ? { ...p, name: renameValue.trim() } : p))
    );
    setRenameProjectId(null);
  };

  const handleOpenDelete = (e: React.MouseEvent, projectId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setMenuProjectId(null);
    setDeleteProjectId(projectId);
  };

  const handleOpenPreview = (e: React.MouseEvent, project: Project) => {
    e.preventDefault();
    e.stopPropagation();
    setMenuProjectId(null);
    setPreviewProject(project);
  };

  const handleDelete = async () => {
    if (!deleteProjectId) return;
    setDeleteLoading(true);
    await deleteProject(deleteProjectId);
    setProjects((prev) => prev.filter((p) => p.id !== deleteProjectId));
    setDeleteLoading(false);
    setDeleteProjectId(null);
  };

  return (
    <main className="flex-1 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">{t('title')}</h1>
            <p className="mt-1 text-secondary">{t('subtitle')}</p>
          </div>
        </div>

        <section className="mb-10">
          <h2 className="mb-4 text-lg font-semibold text-foreground">{t('newProject')}</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {PRESETS.map((preset) => (
              <button
                key={preset.name}
                onClick={() => handleCreate(preset)}
                className="flex items-center gap-4 rounded-xl border border-stroke bg-card-bg p-4 text-left transition-colors hover:border-brand-primary hover:bg-brand-primary-light/10"
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-brand-primary/10 text-brand-primary">
                  <LuPlus className="h-6 w-6" />
                </div>
                <div>
                  <p className="font-semibold text-foreground">{preset.name}</p>
                  <p className="text-sm text-secondary">{preset.width} × {preset.height}</p>
                </div>
              </button>
            ))}
            <button
              type="button"
              onClick={() => setCustomOpen(true)}
              className="flex items-center gap-4 rounded-xl border border-dashed border-stroke bg-card-bg p-4 text-left transition-colors hover:border-brand-primary hover:bg-brand-primary-light/10"
            >
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-brand-primary/10 text-brand-primary">
                <LuPlus className="h-6 w-6" />
              </div>
              <div>
                <p className="font-semibold text-foreground">{t('custom')}</p>
                <p className="text-sm text-secondary">{t('customSize')}</p>
              </div>
            </button>
          </div>
        </section>

        <section>
          <h2 className="mb-4 text-lg font-semibold text-foreground">{t('recentDesigns')}</h2>
          {loading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[...Array(6)].map((_, i) => (
                <Card key={i} className="aspect-4/3 animate-pulse bg-muted" />
              ))}
            </div>
          ) : projects.length === 0 ? (
            <EmptyState
              title={t('emptyTitle')}
              description={t('emptyDescription')}
              action={
                <Button onClick={() => handleCreate(PRESETS[0])}>{t('createFirst')}</Button>
              }
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {projects.map((project) => (
                <Card
                  key={project.id}
                  className="group relative overflow-hidden border-stroke bg-card-bg p-0 transition-colors hover:border-brand-primary"
                  style={{ aspectRatio: project.canvasWidth / project.canvasHeight }}
                >
                  <Link href={`/editor/${project.id}`} className="block h-full w-full">
                    <ProjectCardPreview project={project} className="h-full w-full" />
                    <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/70 to-transparent p-4">
                      <p className="truncate font-medium text-white">{project.name}</p>
                      <p className="text-xs text-white/80">
                        {new Date(project.updatedAt).toLocaleDateString()}
                      </p>
                    </div>
                  </Link>

                  <div className="absolute right-2 top-2" ref={menuProjectId === project.id ? menuRef : undefined}>
                    <button
                      type="button"
                      onClick={(e) => handleOpenMenu(e, project.id)}
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white transition-opacity hover:bg-black/70"
                      aria-label={t('menu')}
                    >
                      <LuEllipsisVertical className="h-4 w-4" />
                    </button>

                    {menuProjectId === project.id && (
                      <div className="absolute right-0 top-full z-20 mt-1 w-44 rounded-lg border border-stroke bg-card-bg py-1 shadow-lg">
                        <button
                          type="button"
                          onClick={(e) => handleOpenPreview(e, project)}
                          className="flex w-full items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-muted"
                        >
                          <LuEye className="h-4 w-4" />
                          {t('preview')}
                        </button>
                        <button
                          type="button"
                          onClick={(e) => handleOpenRename(e, project)}
                          className="flex w-full items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-muted"
                        >
                          <LuPencil className="h-4 w-4" />
                          {t('rename')}
                        </button>
                        <button
                          type="button"
                          onClick={(e) => handleOpenDelete(e, project.id)}
                          className="flex w-full items-center gap-2 px-3 py-2 text-sm text-error hover:bg-error/10"
                        >
                          <LuTrash2 className="h-4 w-4" />
                          {t('delete')}
                        </button>
                      </div>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </section>
      </div>

      <Modal
        isOpen={!!renameProjectId}
        onClose={() => setRenameProjectId(null)}
        title={t('renameTitle')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setRenameProjectId(null)}>
              {t('cancel')}
            </Button>
            <Button variant="primary" onClick={handleRename}>
              {t('save')}
            </Button>
          </>
        }
      >
        <Input
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          placeholder={t('renamePlaceholder')}
          autoFocus
        />
      </Modal>

      <AlertDialog
        isOpen={!!deleteProjectId}
        onClose={() => setDeleteProjectId(null)}
        onConfirm={handleDelete}
        title={t('deleteTitle')}
        description={t('deleteDescription')}
        confirmLabel={t('deleteConfirm')}
        cancelLabel={t('cancel')}
        loading={deleteLoading}
        variant="danger"
      />

      <Modal
        isOpen={customOpen}
        onClose={() => setCustomOpen(false)}
        title={t('customSize')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setCustomOpen(false)}>
              {t('cancel')}
            </Button>
            <Button variant="primary" onClick={handleCreateCustom}>
              {t('create')}
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-4">
          <Input
            label={t('width')}
            type="text"
            inputMode="numeric"
            value={customWidth}
            onChange={(e) => setCustomWidth(e.target.value)}
          />
          <Input
            label={t('height')}
            type="text"
            inputMode="numeric"
            value={customHeight}
            onChange={(e) => setCustomHeight(e.target.value)}
          />
        </div>
      </Modal>

      <Modal
        isOpen={!!previewProject}
        onClose={() => setPreviewProject(null)}
        title={previewProject?.name}
        size="lg"
      >
        <div className="flex items-center justify-center rounded-lg bg-muted p-4">
          {previewProject?.thumbnail ? (
            <img
              src={previewProject.thumbnail}
              alt={previewProject.name}
              className="max-h-[70vh] max-w-full rounded-lg object-contain shadow-lg"
            />
          ) : (
            <div className="flex h-64 w-full flex-col items-center justify-center gap-3 text-secondary">
              <LuImageOff className="h-12 w-12" />
              <p>{t('noPreview')}</p>
            </div>
          )}
        </div>
      </Modal>
    </main>
  );
}
