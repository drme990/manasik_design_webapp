'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations, useLocale } from '@/lib/i18n/strings';
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
  const isRtl = locale === 'ar';

  const navItems = [
    { href: '/projects', label: t('projects'), icon: LuLayoutGrid },
    { href: '/templates', label: t('templates'), icon: LuPalette },
    { href: '/pdf-tool', label: t('pdfTool'), icon: LuFileText },
  ];

  return (
    <>
      {/* Backdrop with fade transition */}
      <div
        className={cn(
          'fixed inset-0 z-40 bg-black/50 transition-opacity duration-300 lg:hidden',
          isOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
        )}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        className={cn(
          'z-40 shrink-0 bg-toolbar-bg border-toolbar-border',
          'fixed top-16 h-[calc(100svh-4rem)] lg:static',
          // Language-aware placement: sidebar lives on the "start" side.
          // LTR -> left, RTL -> right.
          isRtl ? 'right-0 border-l' : 'left-0 border-r',
          // Mobile: keep a fixed width and slide via transform (cleanest slide).
          // Desktop: collapse by width while fading opacity.
          'w-64',
          'will-change-transform lg:will-change-[width,opacity]',
          'transition-transform duration-500 ease-in-out lg:transition-[width,opacity]',
          isOpen ? 'translate-x-0 opacity-100 lg:w-64' : 'opacity-0',
          !isOpen && (isRtl ? 'translate-x-full' : '-translate-x-full'),
          !isOpen && 'lg:w-0',
          'overflow-hidden',
          className
        )}
      >
        <div
          className={cn(
            'flex h-full flex-col transition-opacity duration-200',
            isOpen ? 'opacity-100' : 'opacity-0'
          )}
        >
          <nav className="flex-1 overflow-y-auto p-4">
            <div className="flex flex-col gap-1">
              {navItems.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onClose}
                    className={cn(
                      'flex items-center gap-3 whitespace-nowrap rounded-lg px-4 py-3 text-sm font-medium transition-colors',
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
            </div>
          </nav>
        </div>
      </aside>
    </>
  );
}
