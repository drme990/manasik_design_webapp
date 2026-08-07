'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from '@/lib/i18n/strings';
import { useClickOutside } from '@/lib/hooks/use-click-outside';
import { cn } from '@/lib/utils/cn';
import { LuLogOut, LuChevronDown } from 'react-icons/lu';
import ThemeToggle from './ThemeToggle';

interface CurrentUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

export interface UserMenuProps {
  className?: string;
}

/**
 * User menu — avatar button in the header that opens a dropdown with:
 *   1. Current user info (name + email)
 *   2. Theme toggle (using the shared ThemeToggle component)
 *   3. Logout button
 *
 * Shared component — can be used in any app that has the same auth
 * cookie (/api/auth/me + /api/auth/logout endpoints).
 */
export default function UserMenu({ className }: UserMenuProps) {
  const t = useTranslations('header');
  const router = useRouter();

  const [isOpen, setIsOpen] = useState(false);
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useClickOutside(menuRef, () => setIsOpen(false));

  // Fetch the current user once on mount
  useEffect(() => {
    let cancelled = false;
    fetch('/api/auth/me', { credentials: 'same-origin' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.success && data?.data) {
          setUser(data.data as CurrentUser);
        }
      })
      .catch(() => {
        // Not logged in or network error — menu still works for theme
      });
    return () => { cancelled = true; };
  }, []);

  const handleLogout = useCallback(async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'same-origin',
      });
      router.replace('/login');
    } catch {
      setLoggingOut(false);
    }
  }, [loggingOut, router]);

  // First letter of the user's name for the avatar
  const initial = user?.name ? user.name.trim()[0]?.toUpperCase() : '?';

  return (
    <div ref={menuRef} className={cn('relative', className)}>
      {/* Trigger — avatar + chevron */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1 rounded-full p-0.5 transition-colors hover:bg-muted"
        aria-label={t('userMenu')}
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-primary text-sm font-bold text-white">
          {initial}
        </span>
        <LuChevronDown className={cn(
          'h-4 w-4 text-secondary transition-transform',
          isOpen && 'rotate-180',
        )} />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute top-full left-0 mt-2 w-64 overflow-hidden rounded-lg border border-stroke bg-card-bg shadow-lg z-50">
          {/* User info */}
          <div className="flex items-center gap-3 border-b border-stroke p-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-primary text-sm font-bold text-white">
              {initial}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-foreground">
                {user?.name ?? '—'}
              </p>
              <p className="truncate text-xs text-secondary">
                {user?.email ?? '—'}
              </p>
            </div>
          </div>

          {/* Theme toggle */}
          <div className="flex items-center justify-between gap-2 border-b border-stroke p-3">
            <span className="text-sm font-medium text-foreground">
              {t('theme')}
            </span>
            <ThemeToggle />
          </div>

          {/* Logout */}
          <button
            type="button"
            onClick={handleLogout}
            disabled={loggingOut}
            className={cn(
              'flex w-full items-center gap-2 px-4 py-3 text-sm text-error transition-colors hover:bg-error/10',
              loggingOut && 'opacity-50 cursor-not-allowed',
            )}
          >
            <LuLogOut className="h-4 w-4" />
            {loggingOut ? t('loggingOut') : t('logout')}
          </button>
        </div>
      )}
    </div>
  );
}
