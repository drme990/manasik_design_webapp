'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils/cn';

export interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
  className?: string;
}

export default function Sidebar({ isOpen = false, onClose, className }: SidebarProps) {
  const pathname = usePathname();
  const t = useTranslations('navigation');
  const sidebarT = useTranslations('sidebar');

  const navItems = [
    { href: '/', label: t('home'), icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
    { href: '/templates', label: t('templates'), icon: 'M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM5 13a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1v-2zM5 21a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1v-2z' },
    { href: '/pdf-tool', label: t('pdfTool'), icon: 'M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z' },
  ];

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={onClose}
        />
      )}
      <aside
        className={cn(
          'fixed top-16 right-0 z-40 h-[calc(100vh-4rem)] w-64',
          'border-l border-toolbar-border bg-toolbar-bg',
          'transform transition-transform duration-300 lg:translate-x-0',
          isOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0',
          className
        )}
      >
        <nav className="flex flex-col gap-1 p-4">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-brand-primary text-primary-text'
                    : 'text-foreground hover:bg-muted'
                )}
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon} />
                </svg>
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="absolute bottom-0 right-0 left-0 border-t border-toolbar-border p-4">
          <div className="rounded-lg bg-muted p-3">
            <p className="text-xs font-medium text-secondary">{sidebarT('storage')}</p>
            <div className="mt-2 h-2 w-full rounded-full bg-stroke">
              <div className="h-full w-3/5 rounded-full bg-brand-primary" />
            </div>
            <p className="mt-1 text-xs text-foreground">60% {sidebarT('used')}</p>
          </div>
        </div>
      </aside>
    </>
  );
}
