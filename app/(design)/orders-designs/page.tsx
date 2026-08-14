'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useTranslations } from '@/lib/i18n/strings';
import { LuPencil, LuTrash2, LuArrowLeft, LuSearch, LuRefreshCw } from 'react-icons/lu';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import AlertDialog from '@/components/ui/AlertDialog';
import Pagination from '@/components/ui/Pagination';
import ProjectCardPreview from '@/components/projects/ProjectCardPreview';
import { useProjectStore } from '@/lib/store/use-project-store';

type DateQuickPreset = 'today' | 'yesterday' | 'last7Days' | 'last30Days' | 'all';

/** Returns an ISO date string (YYYY-MM-DD) for today ± offsetDays. */
function getRelativeIsoDate(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

export default function OrdersDesignsPage() {
  const t = useTranslations('ordersDesigns');
  const navT = useTranslations('navigation');
  const uiT = useTranslations('ui');

  const orderDesigns = useProjectStore((s) => s.orderDesigns);
  const fetchOrderDesignsPage = useProjectStore((s) => s.fetchOrderDesignsPage);
  const storeDeleteProject = useProjectStore((s) => s.deleteProject);
  const page = useProjectStore((s) => s.orderDesignsPage);
  const pageSize = useProjectStore((s) => s.orderDesignsPageSize);
  const total = useProjectStore((s) => s.orderDesignsTotal);
  const totalPages = useProjectStore((s) => s.orderDesignsTotalPages);
  const loading = useProjectStore((s) => s.orderDesignsPaginatedLoading);
  const storeFromDate = useProjectStore((s) => s.orderDesignsFromDate);
  const storeToDate = useProjectStore((s) => s.orderDesignsToDate);
  const storeSearch = useProjectStore((s) => s.orderDesignsSearch);

  const [deleteProjectId, setDeleteProjectId] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Local filter state (synced to store on fetch)
  const [fromDate, setFromDate] = useState(storeFromDate);
  const [toDate, setToDate] = useState(storeToDate);
  const [searchInput, setSearchInput] = useState(storeSearch);

  // ── Date presets ──────────────────────────────────────────────────
  const today = getRelativeIsoDate(0);
  const yesterday = getRelativeIsoDate(-1);
  const last7DaysStart = getRelativeIsoDate(-6);
  const last30DaysStart = getRelativeIsoDate(-29);

  const activeDatePreset: DateQuickPreset | 'custom' = useMemo(() => {
    if (!fromDate && !toDate) return 'all';
    if (fromDate === today && toDate === today) return 'today';
    if (fromDate === yesterday && toDate === yesterday) return 'yesterday';
    if (fromDate === last7DaysStart && toDate === today) return 'last7Days';
    if (fromDate === last30DaysStart && toDate === today) return 'last30Days';
    return 'custom';
  }, [fromDate, toDate, today, yesterday, last7DaysStart, last30DaysStart]);

  const applyDatePreset = (preset: DateQuickPreset) => {
    if (preset === 'all') { setFromDate(''); setToDate(''); return; }
    if (preset === 'today') { setFromDate(today); setToDate(today); return; }
    if (preset === 'yesterday') { setFromDate(yesterday); setToDate(yesterday); return; }
    if (preset === 'last7Days') { setFromDate(last7DaysStart); setToDate(today); return; }
    if (preset === 'last30Days') { setFromDate(last30DaysStart); setToDate(today); return; }
  };

  // ── Fetch with current filters ────────────────────────────────────
  const fetchWithFilters = useCallback(
    (targetPage: number, targetPageSize?: number) => {
      fetchOrderDesignsPage({
        page: targetPage,
        limit: targetPageSize,
        fromDate,
        toDate,
        search: searchInput.trim(),
      });
    },
    [fetchOrderDesignsPage, fromDate, toDate, searchInput],
  );

  // Initial load
  useEffect(() => {
    fetchWithFilters(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Handlers ──────────────────────────────────────────────────────
  const handleSearchSubmit = () => fetchWithFilters(1);
  const handleRefresh = () => fetchWithFilters(page);
  const handlePageChange = (newPage: number) => {
    if (newPage < 1 || newPage > totalPages) return;
    fetchWithFilters(newPage);
  };
  const handlePageSizeChange = (newSize: number) => {
    fetchWithFilters(1, newSize);
  };

  const handleDelete = async () => {
    if (!deleteProjectId) return;
    setDeleteLoading(true);
    try {
      await storeDeleteProject(deleteProjectId);
      setDeleteProjectId(null);
      // Refresh current page to update the list + total count
      fetchWithFilters(page);
    } catch (error) {
      console.error('Failed to delete order design:', error);
    } finally {
      setDeleteLoading(false);
    }
  };

  // Re-fetch when filters change (but not on every keystroke — only
  // when the user explicitly triggers a search or changes dates)
  useEffect(() => {
    // Only auto-fetch on date changes, not search (search has its own button)
    fetchWithFilters(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromDate, toDate]);

  const isLoading = loading && orderDesigns.length === 0;
  const datePresetOptions: Array<{ label: string; value: DateQuickPreset }> = [
    { label: t('all'), value: 'all' },
    { label: t('today'), value: 'today' },
    { label: t('yesterday'), value: 'yesterday' },
    { label: t('last7Days'), value: 'last7Days' },
    { label: t('last30Days'), value: 'last30Days' },
  ];

  return (
    <main className="flex-1 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <div className="mb-8">
          <div className="mb-3 flex items-center gap-3">
            <Link
              href="/"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-stroke bg-card-bg text-foreground transition-colors hover:bg-muted"
              aria-label={uiT('back')}
            >
              <LuArrowLeft className="h-5 w-5 rtl:rotate-180" />
            </Link>
            <h1 className="text-3xl font-bold text-foreground">{navT('ordersDesigns')}</h1>
          </div>
          <p className="mt-1 text-secondary">{t('subtitle')}</p>
        </div>

        {/* Filters */}
        <div className="mb-6 space-y-4">
          {/* Search + refresh */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <LuSearch size={16} className="absolute top-1/2 -translate-y-1/2 inset-s-3 text-secondary" />
              <input
                type="text"
                placeholder={t('search')}
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSearchSubmit(); }}
                className="w-full ps-9 pe-4 py-2 rounded-lg border border-stroke bg-background focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary transition-colors text-sm"
              />
            </div>
            <Button variant="primary" size="md" onClick={handleSearchSubmit}>
              <LuSearch size={16} className="me-1" />
              {t('search')}
            </Button>
            <Button variant="outline" size="md" onClick={handleRefresh} className="shrink-0">
              <LuRefreshCw size={16} />
            </Button>
          </div>

          {/* Date presets */}
          <div className="rounded-site border border-stroke bg-card-bg p-4 space-y-4">
            {/* Date pickers */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-secondary">{t('fromDate')}</label>
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-stroke bg-background focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary transition-colors text-sm"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-secondary">{t('toDate')}</label>
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-stroke bg-background focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary transition-colors text-sm"
                />
              </div>
            </div>

            {/* Quick presets */}
            <div className="flex flex-wrap items-center gap-2">
              {datePresetOptions.map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  onClick={() => applyDatePreset(preset.value)}
                  className={`rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${activeDatePreset === preset.value
                    ? 'bg-foreground border-foreground text-background shadow-sm'
                    : 'bg-background border-stroke text-foreground hover:bg-foreground/5'
                    }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Total count */}
          <div className="flex items-center gap-2 text-sm text-secondary">
            <span>
              {t('total')}: {total}
            </span>
          </div>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div
                key={i}
                className="flex flex-col overflow-hidden rounded-2xl border border-stroke bg-card-bg"
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
          <>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {orderDesigns.map((project) => (
                <div
                  key={project.id}
                  className="flex flex-col overflow-hidden rounded-2xl border border-stroke bg-card-bg shadow-sm transition-shadow hover:shadow-md"
                >
                  {/* Preview */}
                  <Link href={`/editor/d/${project.id}`} className="block shrink-0">
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
                    <Link href={`/editor/d/${project.id}`}>
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

            {/* Pagination */}
            <Pagination
              currentPage={page}
              totalPages={totalPages}
              onPageChange={handlePageChange}
              disabled={loading}
              pageSize={pageSize}
              onPageSizeChange={handlePageSizeChange}
              total={total}
            />
          </>
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
    </main>
  );
}
