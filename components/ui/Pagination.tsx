'use client';

import { LuChevronLeft, LuChevronRight } from 'react-icons/lu';
import { Button } from './Button';
import { Select } from './Select';
import { useTranslations } from '@/lib/i18n/strings';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  disabled?: boolean;
  pageSize?: number;
  onPageSizeChange?: (size: number) => void;
  total?: number;
}

const PAGE_SIZE_OPTIONS = [12, 24, 48, 100, 250] as const;

/**
 * Pagination component matching the admin panel's layout.
 *
 * Layout (RTL):
 *   [page size select] [page X of Y]     [prev] [1] [2] ... [5] [next]
 *
 * In RTL, "previous" points right (→) and "next" points left (←),
 * matching the reading direction. The chevrons are NOT rotated —
 * LuChevronRight naturally points right (prev in RTL), LuChevronLeft
 * naturally points left (next in RTL).
 */
export default function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  disabled = false,
  pageSize = 24,
  onPageSizeChange,
  total,
}: PaginationProps) {
  const t = useTranslations('ordersDesigns');

  const canGoPrev = currentPage > 1;
  const canGoNext = currentPage < totalPages;

  const pageSizeOptions = PAGE_SIZE_OPTIONS.map((size) => ({
    value: String(size),
    label: String(size),
  }));

  if (totalPages <= 1 && !onPageSizeChange) return null;

  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    const maxVisible = 5;

    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      if (currentPage <= 3) {
        for (let i = 1; i <= 4; i++) pages.push(i);
        pages.push('...');
        pages.push(totalPages);
      } else if (currentPage >= totalPages - 2) {
        pages.push(1);
        pages.push('...');
        for (let i = totalPages - 3; i <= totalPages; i++) pages.push(i);
      } else {
        pages.push(1);
        pages.push('...');
        pages.push(currentPage - 1);
        pages.push(currentPage);
        pages.push(currentPage + 1);
        pages.push('...');
        pages.push(totalPages);
      }
    }

    return pages;
  };

  return (
    <div className="flex items-center justify-between bg-card-bg border border-stroke rounded-site px-4 py-3 mt-6 flex-wrap gap-3">
      {/* Left side: page size + info */}
      <div className="flex items-center gap-3">
        {onPageSizeChange && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-secondary">{t('show')}</span>
            <div className="w-20">
              <Select
                value={String(pageSize)}
                options={pageSizeOptions}
                onChange={(e) => onPageSizeChange(Number(e.target.value))}
                disabled={disabled}
                className="py-1.5"
              />
            </div>
          </div>
        )}
        <div className="text-sm text-secondary">
          {t('page')} {currentPage} {t('of')} {totalPages}
          {total !== undefined && ` · ${total} ${t('total')}`}
        </div>
      </div>

      {/* Right side: page numbers */}
      {totalPages > 1 && (
        <div className="flex items-center gap-1">
          {/* Previous button — in RTL, "previous" is on the right, arrow points right */}
          <Button
            variant="ghost"
            size="sm"
            type="button"
            onClick={() => onPageChange(currentPage - 1)}
            disabled={disabled || !canGoPrev}
            className="h-8 w-8 p-0 rounded-lg hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label={t('prev')}
          >
            <LuChevronRight size={18} />
          </Button>

          {getPageNumbers().map((page, index) =>
            page === '...' ? (
              <span key={`ellipsis-${index}`} className="px-2 text-secondary">
                ...
              </span>
            ) : (
              <button
                type="button"
                key={page}
                onClick={() => onPageChange(page as number)}
                disabled={disabled}
                className={`min-w-8 h-8 px-3 rounded-lg text-sm font-medium transition-colors ${currentPage === page
                  ? 'bg-brand-primary text-primary-text'
                  : 'hover:bg-muted text-foreground'
                  }`}
              >
                {page}
              </button>
            ),
          )}

          {/* Next button — in RTL, "next" is on the left, arrow points left */}
          <Button
            variant="ghost"
            size="sm"
            type="button"
            onClick={() => onPageChange(currentPage + 1)}
            disabled={disabled || !canGoNext}
            className="h-8 w-8 p-0 rounded-lg hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label={t('next')}
          >
            <LuChevronLeft size={18} />
          </Button>
        </div>
      )}
    </div>
  );
}
