'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from '@/lib/i18n/strings';
import { LuPencil, LuTrash2, LuShoppingBag } from 'react-icons/lu';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import AlertDialog from '@/components/ui/AlertDialog';
import ProjectCardPreview from '@/components/projects/ProjectCardPreview';
import { useProjectStore } from '@/lib/store/use-project-store';

export default function OrdersDesignsPage() {
  const t = useTranslations('ordersDesigns');
  const navT = useTranslations('navigation');
  const orderDesigns = useProjectStore((s) => s.orderDesigns);
  const loading = useProjectStore((s) => s.orderDesignsLoading);
  const fetchOrderDesigns = useProjectStore((s) => s.fetchOrderDesigns);
  const storeDeleteProject = useProjectStore((s) => s.deleteProject);
  const [deleteProjectId, setDeleteProjectId] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  useEffect(() => {
    fetchOrderDesigns();
  }, [fetchOrderDesigns]);

  const handleDelete = async () => {
    if (!deleteProjectId) return;
    setDeleteLoading(true);
    try {
      await storeDeleteProject(deleteProjectId);
      setDeleteProjectId(null);
    } catch (error) {
      console.error('Failed to delete order design:', error);
    } finally {
      setDeleteLoading(false);
    }
  };

  const isLoading = loading && orderDesigns.length === 0;

  return (
    <div className="flex min-h-[calc(100svh-4rem)] flex-col p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <LuShoppingBag className="h-7 w-7 text-brand-primary" />
        <div>
          <h1 className="text-2xl font-bold text-foreground">{navT('ordersDesigns')}</h1>
          <p className="mt-1 text-sm text-secondary">{t('subtitle')}</p>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex flex-wrap gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="flex w-48 shrink-0 flex-col overflow-hidden rounded-2xl border border-stroke bg-card-bg sm:w-56"
            >
              <div className="aspect-4/3 w-full animate-pulse rounded-t-2xl bg-muted" />
              <div className="p-3">
                <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
                <div className="mt-1.5 h-3 w-1/2 animate-pulse rounded bg-muted/70" />
              </div>
            </div>
          ))}
        </div>
      ) : orderDesigns.length === 0 ? (
        <EmptyState
          title={t('emptyTitle')}
          description={t('emptyDescription')}
        />
      ) : (
        <div className="flex flex-wrap gap-4">
          {orderDesigns.map((project) => (
            <div
              key={project.id}
              className="flex w-48 shrink-0 flex-col overflow-hidden rounded-2xl border border-stroke bg-card-bg shadow-sm transition-shadow hover:shadow-md sm:w-56"
            >
              {/* Preview */}
              <Link href={`/editor/${project.id}`} className="block shrink-0">
                <div className="relative aspect-4/3 w-full overflow-hidden rounded-t-2xl">
                  <ProjectCardPreview project={project} className="h-full w-full" />
                </div>
              </Link>
              {/* Name + date */}
              <div className="flex flex-1 flex-col px-3 py-2.5">
                <h3 className="line-clamp-1 text-sm font-semibold text-foreground" title={project.name}>
                  {project.name}
                </h3>
                <p className="mt-0.5 text-xs text-secondary">
                  {new Date(project.updatedAt).toLocaleDateString('ar')}
                </p>
              </div>
              {/* Actions */}
              <div className="flex items-center gap-1 px-2.5 pb-2.5 pt-1">
                <Link href={`/editor/${project.id}`}>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0" aria-label={t('edit')}>
                    <LuPencil className="h-4 w-4" />
                  </Button>
                </Link>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 text-secondary hover:text-destructive"
                  onClick={() => setDeleteProjectId(project.id)}
                  aria-label={t('delete')}
                >
                  <LuTrash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Delete confirmation */}
      <AlertDialog
        isOpen={!!deleteProjectId}
        onClose={() => setDeleteProjectId(null)}
        title={t('deleteTitle')}
        description={t('deleteDescription')}
        confirmLabel={t('delete')}
        cancelLabel={t('cancel')}
        onConfirm={handleDelete}
        loading={deleteLoading}
        variant="danger"
      />
    </div>
  );
}
