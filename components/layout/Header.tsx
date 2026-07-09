'use client';

import Link from 'next/link';
import { useTheme } from 'next-themes';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils/cn';
import LanguageToggle from '@/components/shared/LanguageToggle';

export interface HeaderProps {
  onMenuClick?: () => void;
  className?: string;
}

const THEMES = ['light', 'black', 'manasik', 'ghadaq', 'colors'] as const;

export default function Header({ onMenuClick, className }: HeaderProps) {
  const { theme, setTheme } = useTheme();
  const t = useTranslations('header');
  const themeT = useTranslations('themes');

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
          {onMenuClick && (
            <button
              onClick={onMenuClick}
              className="p-2 rounded-lg text-foreground hover:bg-muted lg:hidden"
              aria-label={t('openMenu')}
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          )}
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
          <select
            value={theme ?? 'manasik'}
            onChange={(e) => setTheme(e.target.value)}
            className="rounded-lg border border-stroke bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand-primary"
          >
            {THEMES.map((themeId) => (
              <option key={themeId} value={themeId}>
                {themeT(themeId)}
              </option>
            ))}
          </select>

          <LanguageToggle />

          <button
            className="flex h-9 w-9 items-center justify-center rounded-lg text-foreground hover:bg-muted"
            aria-label={t('notifications')}
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
          </button>

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
