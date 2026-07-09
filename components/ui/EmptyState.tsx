import { ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';
import { useTranslations } from 'next-intl';

export interface EmptyStateProps {
  title?: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export default function EmptyState({
  title,
  description,
  icon,
  action,
  className,
}: EmptyStateProps) {
  const t = useTranslations('ui.emptyState');
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-lg border border-dashed border-stroke',
        'bg-muted/30 p-8 text-center',
        className
      )}
    >
      {icon || (
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-secondary">
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
          </svg>
        </div>
      )}
      <h3 className="mt-4 text-lg font-medium text-foreground">{title ?? t('title')}</h3>
      {description !== undefined && (
        <p className="mt-1 max-w-sm text-sm text-secondary">{description ?? t('description')}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export { EmptyState };