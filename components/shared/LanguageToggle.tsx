'use client';

import { useTransition } from 'react';
import { useLocale } from 'next-intl';
import { setUserLocale } from '@/lib/i18n/actions';
import { cn } from '@/lib/utils/cn';

export interface LanguageToggleProps {
  className?: string;
}

export default function LanguageToggle({ className }: LanguageToggleProps) {
  const locale = useLocale();
  const [isPending, startTransition] = useTransition();

  const toggleLocale = () => {
    const nextLocale = locale === 'ar' ? 'en' : 'ar';
    startTransition(async () => {
      await setUserLocale(nextLocale);
      window.location.reload();
    });
  };

  return (
    <button
      onClick={toggleLocale}
      disabled={isPending}
      className={cn(
        'inline-flex items-center gap-2 rounded-lg border border-stroke bg-card-bg px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted',
        className
      )}
      aria-label={locale === 'ar' ? 'Switch to English' : 'التبديل إلى العربية'}
    >
      <span className="uppercase">{locale === 'ar' ? 'EN' : 'AR'}</span>
      <span>{locale === 'ar' ? 'English' : 'العربية'}</span>
    </button>
  );
}
