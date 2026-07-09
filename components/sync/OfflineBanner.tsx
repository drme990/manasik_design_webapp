'use client';

import { cn } from '@/lib/utils/cn';
import { LuWifiOff } from 'react-icons/lu';
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
      <LuWifiOff className="h-4 w-4" />
      <span>{t('offlineMessage')}</span>
    </div>
  );
}
