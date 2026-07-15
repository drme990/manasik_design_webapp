'use client';

import { cn } from '@/lib/utils/cn';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { useTranslations, useLocale } from '@/lib/i18n/strings';

export interface SyncStatusProps {
  isOnline?: boolean;
  isSyncing?: boolean;
  pendingCount?: number;
  lastSyncAt?: number | null;
  className?: string;
}

export default function SyncStatus({
  isOnline = true,
  isSyncing = false,
  pendingCount = 0,
  lastSyncAt,
  className,
}: SyncStatusProps) {
  const locale = useLocale();
  const t = useTranslations('sync');

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString(locale === 'ar' ? 'ar-SA' : 'en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div
      className={cn(
        'inline-flex items-center gap-2 rounded-full border border-stroke bg-card-bg px-3 py-1.5 text-sm',
        className
      )}
    >
      {isSyncing ? (
        <>
          <LoadingSpinner size="sm" color="primary" className="inline-flex!" />
          <span className="text-foreground">{t('syncing')}</span>
        </>
      ) : isOnline ? (
        <>
          <span className="h-2 w-2 rounded-full bg-success" />
          <span className="text-foreground">{t('online')}</span>
        </>
      ) : (
        <>
          <span className="h-2 w-2 rounded-full bg-error" />
          <span className="text-foreground">{t('offline')}</span>
        </>
      )}

      {pendingCount > 0 && (
        <span className="rounded-full bg-warning/10 px-2 py-0.5 text-xs text-warning">
          {pendingCount} {t('pending')}
        </span>
      )}

      {lastSyncAt && (
        <span className="text-xs text-secondary">
          {t('lastSync')}: {formatTime(lastSyncAt)}
        </span>
      )}
    </div>
  );
}
