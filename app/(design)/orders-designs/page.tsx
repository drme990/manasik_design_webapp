'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useTranslations } from '@/lib/i18n/strings';
import {
  LuPencil, LuTrash2, LuArrowLeft, LuSearch, LuRefreshCw,
  LuChevronLeft, LuChevronRight,
} from 'react-icons/lu';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import AlertDialog from '@/components/ui/AlertDialog';
import CustomDatePicker from '@/components/ui/CustomDatePicker';
import Pagination from '@/components/ui/Pagination';
import ProjectCardPreview from '@/components/projects/ProjectCardPreview';
import { useProjectStore } from '@/lib/store/use-project-store';

type DateQuickPreset = 'today' | 'tomorrow' | 'yesterday' | 'last7Days' | 'last30Days' | 'all';

/** Returns an ISO date string (YYYY-MM-DD) for today ± offsetDays. */
function getRelativeIsoDate(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

/** Add days to an ISO date string (YYYY-MM-DD) → YYYY-MM-DD */
function addDaysToIsoDate(isoDate: string, days: number): string {
  const date = new Date(isoDate + 'T00:00:00');
  date.setDate(date.getDate() + days);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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
  // Default to "tomorrow" — same as the execution page's default
  const tomorrowDefault = getRelativeIsoDate(1);
  const [fromDate, setFromDate] = useState(storeFromDate || tomorrowDefault);
  const [toDate, setToDate] = useState(storeToDate || tomorrowDefault);
  const [searchInput, setSearchInput] = useState(storeSearch);

  // ── Date presets ──────────────────────────────────────────────────
  const today = getRelativeIsoDate(0);
  const tomorrow = getRelativeIsoDate(1);
  const yesterday = getRelativeIsoDate(-1);
  const last7DaysStart = getRelativeIsoDate(-6);
  const last30DaysStart = getRelativeIsoDate(-29);

  const activeDatePreset: DateQuickPreset | 'custom' = useMemo(() => {
    if (!fromDate && !toDate) return 'all';
    if (fromDate === today && toDate === today) return 'today';
    if (fromDate === tomorrow && toDate === tomorrow) return 'tomorrow';
    if (fromDate === yesterday && toDate === yesterday) return 'yesterday';
    if (fromDate === last7DaysStart && toDate === today) return 'last7Days';
    if (fromDate === last30DaysStart && toDate === today) return 'last30Days';
    return 'custom';
  }, [fromDate, toDate, today, tomorrow, yesterday, last7DaysStart, last30DaysStart]);

  const applyDatePreset = (preset: DateQuickPreset) => {
    if (preset === 'all') { setFromDate(''); setToDate(''); return; }
    if (preset === 'today') { setFromDate(today); setToDate(today); return; }
    if (preset === 'tomorrow') { setFromDate(tomorrow); setToDate(tomorrow); return; }
    if (preset === 'yesterday') { setFromDate(yesterday); setToDate(yesterday); return; }
    if (preset === 'last7Days') { setFromDate(last7DaysStart); setToDate(today); return; }
    if (preset === 'last30Days') { setFromDate(last30DaysStart); setToDate(today); return; }
  };

  // ── Date navigation (single-day mode) ─────────────────────────────
  // When a single day is selected (fromDate === toDate), show the
  // execution-style title with prev/next day arrows.
  const isSingleDay = !!fromDate && fromDate === toDate;

  const handlePrevDay = () => {
    if (!fromDate) return;
    const prev = addDaysToIsoDate(fromDate, -1);
    setFromDate(prev);
    setToDate(prev);
  };
  const handleNextDay = () => {
    if (!fromDate) return;
    const next = addDaysToIsoDate(fromDate, 1);
    setFromDate(next);
    setToDate(next);
  };

  // ── Title date formatting ─────────────────────────────────────────
  const titleDate = fromDate || today;
  const titleDateObj = new Date(titleDate + 'T00:00:00');
  const titleDayName = titleDateObj.toLocaleDateString('ar-SA', { weekday: 'long' });
  const [titleYear, titleMonth, titleDay] = titleDate.split('-');
  const titleFormattedDate = `${Number(titleDay)}-${Number(titleMonth)}-${titleYear}`;

  const todayStr = getRelativeIsoDate(0);
  const tomorrowStr = getRelativeIsoDate(1);
  const yesterdayStr = getRelativeIsoDate(-1);
  let relativeLabel: string | null = null;
  if (titleDate === todayStr) relativeLabel = t('today');
  else if (titleDate === tomorrowStr) relativeLabel = t('tomorrow');
  else if (titleDate === yesterdayStr) relativeLabel = t('yesterday');

  const now = new Date();
  const todayDayName = now.toLocaleDateString('ar-SA', { weekday: 'long' });
  const todayFormatted = `${todayDayName} - ${now.getDate()}-${now.getMonth() + 1}-${now.getFullYear()}`;

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
      fetchWithFilters(page);
    } catch (error) {
      console.error('Failed to delete order design:', error);
    } finally {
      setDeleteLoading(false);
    }
  };

  // Re-fetch when date filters change
  useEffect(() => {
    fetchWithFilters(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromDate, toDate]);

  const isLoading = loading && orderDesigns.length === 0;

  // ── Counter grouping by orderNumber ───────────────────────────────
  // Designs sharing the same orderNumber get sub-numbers:
  //   1, 2, 3.1, 3.2, 3.3, 4, 5, ...
  // The base number increments only when a new orderNumber is seen.
  const counters = useMemo(() => {
    const result: string[] = [];
    const orderGroupIndex = new Map<string, number>();
    const orderOccurrence = new Map<string, number>();
    let groupCount = 0;

    for (const project of orderDesigns) {
      const orderNum = project.orderMeta?.orderNumber || project.id;
      const existing = orderGroupIndex.get(orderNum);
      if (existing === undefined) {
        // New order group
        orderGroupIndex.set(orderNum, groupCount);
        orderOccurrence.set(orderNum, 1);
        result.push(String(groupCount + 1));
        groupCount++;
      } else {
        // Same order — sub-number
        const occ = (orderOccurrence.get(orderNum) ?? 0) + 1;
        orderOccurrence.set(orderNum, occ);
        result.push(`${existing + 1}.${occ}`);
      }
    }
    return result;
  }, [orderDesigns]);
  const datePresetOptions: Array<{ label: string; value: DateQuickPreset }> = [
    { label: t('all'), value: 'all' },
    { label: t('today'), value: 'today' },
    { label: t('tomorrow'), value: 'tomorrow' },
    { label: t('yesterday'), value: 'yesterday' },
    { label: t('last7Days'), value: 'last7Days' },
    { label: t('last30Days'), value: 'last30Days' },
  ];

  return (
    <main className="flex-1 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="mb-6">
          <div className="mb-3 flex items-center gap-3">
            <Link
              href="/"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-stroke bg-card-bg text-foreground transition-colors hover:bg-muted"
              aria-label={uiT('back')}
            >
              <LuArrowLeft className="h-5 w-5 rtl:rotate-180" />
            </Link>
            <h1 className="text-2xl font-bold text-foreground">{navT('ordersDesigns')}</h1>
          </div>
        </div>

        {/* Date presets + pickers — same layout as execution page */}
        <div className="mb-4 rounded-site border border-stroke bg-card-bg p-4 space-y-4">
          {/* Date pickers */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <CustomDatePicker
              value={fromDate}
              onChange={setFromDate}
              label={t('fromDate')}
              placeholder={t('fromDate')}
            />
            <CustomDatePicker
              value={toDate}
              onChange={setToDate}
              label={t('toDate')}
              placeholder={t('toDate')}
            />
          </div>

          {/* Quick presets */}
          <div className="flex flex-wrap items-center gap-2">
            {datePresetOptions.map((preset) => (
              <button
                key={preset.value}
                type="button"
                onClick={() => applyDatePreset(preset.value)}
                className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors ${activeDatePreset === preset.value
                  ? 'bg-foreground border-foreground text-background shadow-sm'
                  : 'bg-background border-stroke text-foreground hover:bg-foreground/5'
                  }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        {/* Execution-style title with date navigation arrows */}
        {isSingleDay && (
          <div className="mb-6 flex flex-col items-center gap-2">
            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={handlePrevDay}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-stroke hover:bg-background transition-colors"
                aria-label={t('prevDay')}
              >
                <LuChevronLeft size={18} className="rtl:rotate-180" />
              </button>

              <h2 className="text-lg font-semibold text-foreground rounded-site border border-stroke py-2 px-4">
                {relativeLabel ? (
                  <>
                    <span className="text-success">
                      {t('executions')} {relativeLabel}:
                    </span>
                    {' '}{titleDayName} - {titleFormattedDate}
                  </>
                ) : (
                  <>
                    {t('executions')} {titleDayName} - {titleFormattedDate}
                  </>
                )}
              </h2>

              <button
                type="button"
                onClick={handleNextDay}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-stroke hover:bg-background transition-colors"
                aria-label={t('nextDay')}
              >
                <LuChevronRight size={18} className="rtl:rotate-180" />
              </button>
            </div>
            <span className="text-sm text-secondary">
              {t('todayDate')}: {todayFormatted}
            </span>
          </div>
        )}

        {/* Search + refresh + total */}
        <div className="mb-6 flex flex-col sm:flex-row gap-3 sm:items-center">
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
            {t('searchBtn')}
          </Button>
          <Button variant="outline" size="md" onClick={handleRefresh} className="shrink-0">
            <LuRefreshCw size={16} />
          </Button>
          <span className="text-sm text-secondary shrink-0">
            {t('total')}: {total}
          </span>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
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
            {/* 4 per row on xl, responsive down to 1 */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {orderDesigns.map((project, index) => {
                const meta = project.orderMeta;
                // Display: orderMeta.sizeName (already resolved: sizeDesignName
                // → sizeName with "default" filter) → productName → project name
                const productLabel = meta?.sizeName || meta?.productName || project.name;
                // Counter — grouped by orderNumber (e.g. 1, 2, 3.1, 3.2, 4)
                const counter = counters[index] ?? String(index + 1);
                return (
                  <div
                    key={project.id}
                    className="group relative flex flex-col overflow-hidden rounded-2xl border border-stroke bg-card-bg shadow-sm transition-shadow hover:shadow-md"
                  >
                    {/* #Counter — top left, always visible */}
                    <div className="absolute top-2 left-2 z-10">
                      <span className="flex min-w-7 h-7 px-1.5 items-center justify-center rounded-full bg-brand-primary text-white text-xs font-bold shadow-sm">
                        {counter}
                      </span>
                    </div>

                    {/* Edit + Delete buttons — top right, stacked vertically, always visible */}
                    <div className="absolute top-2 right-2 z-10 flex flex-col gap-1.5">
                      <Link href={`/editor/d/${project.id}`}>
                        <button
                          className="flex h-8 w-8 items-center justify-center rounded-lg bg-background/90 backdrop-blur-sm border border-stroke text-foreground hover:bg-background transition-colors"
                          aria-label={t('edit')}
                        >
                          <LuPencil className="h-4 w-4" />
                        </button>
                      </Link>
                      <button
                        className="flex h-8 w-8 items-center justify-center rounded-lg bg-background/90 backdrop-blur-sm border border-stroke text-secondary hover:text-destructive hover:bg-background transition-colors"
                        onClick={() => setDeleteProjectId(project.id)}
                        aria-label={t('delete')}
                      >
                        <LuTrash2 className="h-4 w-4" />
                      </button>
                    </div>

                    {/* Preview — taller aspect ratio */}
                    <Link href={`/editor/d/${project.id}`} className="block shrink-0">
                      <div className="relative aspect-square w-full overflow-hidden rounded-t-2xl">
                        <ProjectCardPreview project={project} className="h-full w-full" />
                      </div>
                    </Link>

                    {/* Card info */}
                    <div className="flex flex-1 flex-col gap-2 px-4 py-4">
                      {/* Order number */}
                      {meta?.orderNumber && (
                        <span className="text-sm font-bold text-foreground truncate">
                          {meta.orderNumber}
                          {meta.itemIndex && meta.itemIndex > 1 && (
                            <span className="text-xs text-secondary"> #{meta.itemIndex}</span>
                          )}
                        </span>
                      )}

                      {/* Product / size name */}
                      <p
                        className="line-clamp-2 text-sm font-medium text-foreground"
                        title={productLabel}
                      >
                        {productLabel}
                      </p>

                      {/* sacrificeFor */}
                      {meta?.sacrificeFor && (
                        <p className="line-clamp-2 text-xs text-secondary" title={meta.sacrificeFor}>
                          {meta.sacrificeFor}
                        </p>
                      )}

                      {/* Date */}
                      <p className="mt-auto text-xs text-secondary pt-1">
                        {new Date(project.updatedAt).toLocaleDateString('ar')}
                      </p>
                    </div>
                  </div>
                );
              })}
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
