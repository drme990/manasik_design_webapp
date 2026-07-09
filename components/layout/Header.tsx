'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { LuMenu } from 'react-icons/lu';
import { cn } from '@/lib/utils/cn';
import LanguageToggle from '@/components/shared/LanguageToggle';
import ThemeToggle from '@/components/shared/ThemeToggle';

export interface HeaderProps {
  onMenuClick?: () => void;
  className?: string;
}

export default function Header({ onMenuClick, className }: HeaderProps) {
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
          <button
            type="button"
            onClick={onMenuClick}
            className="p-2 rounded-lg text-foreground hover:bg-muted focus:outline-none focus:ring-2 focus:ring-brand-primary"
            aria-label={t('toggleSidebar')}
          >
            <LuMenu className="h-6 w-6" />
          </button>
          <Link href="/projects" className="flex items-center gap-2">
            <div className="gradient-site flex h-9 w-9 items-center justify-center rounded-lg">
              <span className="gradient-text text-lg font-bold">م</span>
            </div>
            <span className="hidden text-xl font-bold text-foreground sm:inline">
              {t('appName')}
            </span>
          </Link>
        </div>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <LanguageToggle />
          <div
            className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-primary text-primary-text text-sm font-bold"
            aria-label={t('userAvatar')}
          >
            م
          </div>
        </div>
      </div>
    </header>
  );
}
