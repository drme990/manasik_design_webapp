'use client';

import Link from 'next/link';
import { useTranslations } from '@/lib/i18n/strings';
import { cn } from '@/lib/utils/cn';
import ThemeToggle from '@/components/shared/ThemeToggle';

export interface HeaderProps {
  className?: string;
}

export default function Header({ className }: HeaderProps) {
  const t = useTranslations('header');

  return (
    <header
      className={cn(
        'fixed top-0 left-0 right-0 z-40 h-16',
        'bg-toolbar-bg border-b border-toolbar-border',
        className
      )}
    >
      <div className="flex h-full items-center justify-between px-4 lg:px-6">
        <div className="flex items-center gap-3">
          <Link href="/projects" className="flex items-center gap-2">
            <div className="gradient-site flex h-9 w-9 items-center justify-center rounded-lg">
              <span className="gradient-text text-lg font-bold">M</span>
            </div>
            <span className="hidden text-xl font-bold text-foreground sm:inline">
              {t('appName')}
            </span>
          </Link>
        </div>

        <div className="flex items-center gap-2">
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
