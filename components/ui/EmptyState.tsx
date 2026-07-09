import { ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';
import { LuInbox } from 'react-icons/lu';
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
          <LuInbox className="h-6 w-6" />
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