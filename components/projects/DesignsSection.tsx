'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from '@/lib/i18n/strings';
import { LuPencil, LuTrash2, LuCopy } from 'react-icons/lu';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { EmptyState } from '@/components/ui/EmptyState';
import Modal from '@/components/ui/Modal';
import AlertDialog from '@/components/ui/AlertDialog';
import ProjectCardPreview from '@/components/projects/ProjectCardPreview';
import { CardsRowSkeleton } from '@/components/projects/SectionSkeleton';
import { useToast } from '@/components/providers/ToastProvider';
import { useDesigns, deleteProject, renameProject, duplicateProject } from '@/lib/query/projects';
import type { ProjectSummary } from '@/types';

/**
 * Recent-designs section of `/` — one independently-streaming unit.
 * SSR-provided `initialProjects` seeds the shared query cache so the
 * first paint ships real cards; when the seed is partial (hit
 * DESIGN_SEED_LIMIT) the query refetches the full list in the
 * background. Mutations write through to the cache — the list is
 * always in sync.
 */
export default function DesignsSection({
  initialProjects,
  seedIsPartial,
}: {
  initialProjects?: ProjectSummary[];
  seedIsPartial?: boolean;
}) {
  const t = useTranslations('projects');
  const uiT = useTranslations('ui');
  const toast = useToast();
  const { data: projects = [], isPending, isError, refetch } = useDesigns(initialProjects, seedIsPartial);
  // loading is true only when we have no data at all yet
  const loading = isPending && projects.length === 0;
  const [renameProjectId, setRenameProjectId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deleteProjectId, setDeleteProjectId] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const handleRename = async () => {
    if (!renameProjectId || !renameValue.trim()) return;
    // Optimistic: store updates the list immediately
    await renameProject(renameProjectId, renameValue.trim());
    setRenameProjectId(null);
  };

  const handleDelete = async () => {
    if (!deleteProjectId) return;
    setDeleteLoading(true);
    // Optimistic: store removes from the list immediately
    await deleteProject(deleteProjectId);
    setDeleteLoading(false);
    setDeleteProjectId(null);
  };

  const handleDuplicate = async (projectId: string) => {
    try {
      const created = await duplicateProject(projectId);
      if (!created) throw new Error('duplicate returned null');
      toast.showToast({ message: t('duplicateSuccess'), variant: 'success' });
    } catch (err) {
      console.error('Failed to duplicate project:', err);
      toast.showToast({ message: t('duplicateFailed'), variant: 'error' });
    }
  };

  return (
    <section className="mb-10">
      <h2 className="mb-4 text-lg font-semibold text-foreground">{t('recentDesigns')}</h2>
      {loading ? (
        <CardsRowSkeleton />
      ) : isError && projects.length === 0 ? (
        <EmptyState
          title={uiT('loadFailed')}
          action={
            <Button variant="outline" onClick={() => refetch()}>
              {uiT('retry')}
            </Button>
          }
        />
      ) : projects.length === 0 ? (
        <EmptyState
          title={t('emptyTitle')}
          description={t('emptyDescription')}
        />
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-none [scroll-snap-type:x_mandatory] [-webkit-overflow-scrolling:touch] [&::-webkit-scrollbar]:hidden">
          {projects.map((project) => (
            <div
              key={project.id}
              className="flex w-48 shrink-0 snap-start flex-col overflow-hidden rounded-2xl border border-stroke bg-card-bg shadow-sm transition-shadow hover:shadow-md sm:w-56"
            >
              {/* Preview */}
              <Link href={`/editor/d/${project.id}`} className="block shrink-0">
                <div className="relative aspect-4/3 w-full overflow-hidden rounded-t-2xl">
                  <ProjectCardPreview project={project} className="h-full w-full" />
                </div>
              </Link>
              {/* Name + date */}
              <Link href={`/editor/d/${project.id}`} className="block px-3 pt-2.5">
                <p className="truncate text-sm font-semibold text-foreground">{project.name}</p>
                <p className="mt-0.5 text-xs text-secondary">
                  {new Date(project.updatedAt).toLocaleDateString()}
                </p>
              </Link>
              {/* Actions */}
              <div className="flex w-full items-center gap-1 px-2.5 pb-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setRenameProjectId(project.id);
                    setRenameValue(project.name);
                  }}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-foreground transition-colors hover:bg-muted"
                  aria-label={t('rename')}
                >
                  <LuPencil className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => handleDuplicate(project.id)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-foreground transition-colors hover:bg-muted"
                  aria-label={t('duplicate')}
                >
                  <LuCopy className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteProjectId(project.id)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-error transition-colors hover:bg-error/10"
                  aria-label={t('delete')}
                >
                  <LuTrash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

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
    </section>
  );
}
