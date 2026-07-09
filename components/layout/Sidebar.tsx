'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { LuLayoutGrid, LuPalette, LuFileText } from 'react-icons/lu';
import { cn } from '@/lib/utils/cn';

export interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
  className?: string;
}

export default function Sidebar({ isOpen = false, onClose, className }: SidebarProps) {
  const pathname = usePathname();
  const locale = useLocale();
  const t = useTranslations('navigation');
  const sidebarT = useTranslations('sidebar');
  const isRtl = locale === 'ar';

  const navItems = [
    { href: '/projects', label: t('projects'), icon: LuLayoutGrid },
    { href: '/templates', label: t('templates'), icon: LuPalette },
    { href: '/pdf-tool', label: t('pdfTool'), icon: LuFileText },
  ];

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}
      <aside
        className={cn(
          'z-40 shrink-0 bg-toolbar-bg border-toolbar-border transition-all duration-300 ease-in-out',
          'fixed top-16 h-[calc(100vh-4rem)] lg:static lg:h-auto',
          // Language-aware placement: sidebar lives on the "start" side.
          // LTR -> left, RTL -> right.
          isRtl ? 'right-0 border-l' : 'left-0 border-r',
          isOpen ? 'w-64 translate-x-0' : 'w-0',
          !isOpen && (isRtl ? 'translate-x-full' : '-translate-x-full'),
          !isOpen && 'overflow-hidden lg:hidden',
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
                <item.icon className="h-5 w-5" />
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
