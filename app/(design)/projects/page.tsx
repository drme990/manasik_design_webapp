'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { useTranslations } from '@/lib/i18n/strings';
import { LuPlus, LuEllipsisVertical, LuPencil, LuTrash2, LuPalette, LuFileText } from 'react-icons/lu';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { EmptyState } from '@/components/ui/EmptyState';
import Modal from '@/components/ui/Modal';
import Drawer from '@/components/ui/Drawer';
import AlertDialog from '@/components/ui/AlertDialog';
import ProjectCardPreview from '@/components/projects/ProjectCardPreview';
import { listProjects, createProject, deleteProject, renameProject } from '@/lib/store/projects';
import { ASPECT_RATIOS } from '@/lib/constants/presets';
import type { Project } from '@/types';

export default function ProjectsPage() {
  const t = useTranslations('projects');
  const navT = useTranslations('navigation');
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [menuProjectId, setMenuProjectId] = useState<string | null>(null);
  const [renameProjectId, setRenameProjectId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deleteProjectId, setDeleteProjectId] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
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

  const handleCreate = async (preset: typeof ASPECT_RATIOS[number]) => {
    const project = await createProject({
      name: `${preset.label} ${preset.name} — ${new Date().toLocaleDateString()}`,
      kind: 'design',
      canvasWidth: preset.width,
      canvasHeight: preset.height,
    });
    setDrawerOpen(false);
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
    setDrawerOpen(false);
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
          <h2 className="mb-4 text-lg font-semibold text-foreground">{t('recentDesigns')}</h2>
          {loading ? (
            <div className="no-scrollbar flex gap-4 overflow-x-auto pb-4">
              {[...Array(6)].map((_, i) => (
                <Card key={i} className="aspect-4/3 h-40 w-56 shrink-0 animate-pulse bg-muted" />
              ))}
            </div>
          ) : projects.length === 0 ? (
            <EmptyState
              title={t('emptyTitle')}
              description={t('emptyDescription')}
            />
          ) : (
            <div className="no-scrollbar flex gap-4 overflow-x-auto pb-4 snap-x">
              {projects.map((project) => (
                <Card
                  key={project.id}
                  className="group relative h-40 w-56 shrink-0 snap-start overflow-hidden border-stroke bg-card-bg p-0 transition-colors hover:border-brand-primary"
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

        <section>
          <h2 className="mb-4 text-lg font-semibold text-foreground">{navT('templates')}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Link
              href="/templates"
              className="flex items-center gap-4 rounded-xl border border-stroke bg-card-bg p-4 transition-colors hover:border-brand-primary hover:bg-brand-primary-light/10"
            >
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-brand-primary/10 text-brand-primary">
                <LuPalette className="h-6 w-6" />
              </div>
              <div>
                <p className="font-semibold text-foreground">{navT('templates')}</p>
                <p className="text-sm text-secondary">{t('subtitle')}</p>
              </div>
            </Link>
            <Link
              href="/pdf-tool"
              className="flex items-center gap-4 rounded-xl border border-stroke bg-card-bg p-4 transition-colors hover:border-brand-primary hover:bg-brand-primary-light/10"
            >
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-brand-primary/10 text-brand-primary">
                <LuFileText className="h-6 w-6" />
              </div>
              <div>
                <p className="font-semibold text-foreground">{navT('pdfTool')}</p>
                <p className="text-sm text-secondary">{navT('pdfTool')}</p>
              </div>
            </Link>
          </div>
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

      {/* Floating + button */}
      <button
        type="button"
        onClick={() => setDrawerOpen(true)}
        className="fixed bottom-6 right-6 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-brand-primary text-primary-text shadow-xl transition-transform hover:scale-105 active:scale-95"
        aria-label={t('newProject')}
      >
        <LuPlus className="h-7 w-7" />
      </button>

      {/* New project drawer */}
      <Drawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={t('newProject')}
        height="twoThirds"
        footer={
          <Button variant="primary" onClick={handleCreateCustom} className="w-full">
            <LuPlus className="ml-2 h-5 w-5" />
            {t('create')}
          </Button>
        }
      >
        {/* Preset sizes — horizontal scroll */}
        <div className="mb-6">
          <h3 className="mb-3 text-sm font-medium text-secondary">{t('newProject')}</h3>
          <div className="no-scrollbar flex gap-3 overflow-x-auto pb-2">
            {ASPECT_RATIOS.map((preset) => {
              const ratio = preset.width / preset.height;
              const boxW = ratio >= 1 ? 48 : Math.round(48 * ratio);
              const boxH = ratio >= 1 ? Math.round(48 / ratio) : 48;
              return (
                <button
                  key={preset.label}
                  onClick={() => handleCreate(preset)}
                  className="flex w-20 shrink-0 flex-col items-center gap-2 rounded-xl border border-stroke bg-card-bg p-3 text-center transition-colors hover:border-brand-primary hover:bg-brand-primary-light/10"
                >
                  {/* Shape preview */}
                  <div className="flex h-12 items-center justify-center">
                    <div
                      className="rounded border-2 border-foreground/40 bg-foreground/5"
                      style={{ width: boxW, height: boxH }}
                    />
                  </div>
                  {/* Aspect ratio */}
                  <p className="text-xs font-semibold text-foreground">{preset.label}</p>
                  {/* Name */}
                  <p className="text-xs text-secondary">{preset.name}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Custom size */}
        <div>
          <h3 className="mb-3 text-sm font-medium text-secondary">{t('customSize')}</h3>
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
        </div>
      </Drawer>

    </main>
  );
}
