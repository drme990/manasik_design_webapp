'use client';

import { cn } from '@/lib/utils/cn';
import { useTranslations } from 'next-intl';

export interface OfflineBannerProps {
  className?: string;
}

export default function OfflineBanner({ className }: OfflineBannerProps) {
  const t = useTranslations('sync');

  return (
    <div
      className={cn(
        'flex items-center justify-center gap-2 bg-warning px-4 py-2 text-sm text-foreground',
        className
      )}
      role="alert"
    >
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
      <span>{t('offlineMessage')}</span>
    </div>
  );
}
