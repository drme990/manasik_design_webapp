'use client';

import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils/cn';
import Header from './Header';
import SmoothScroll from '@/components/providers/SmoothScroll';

export interface DesignShellProps {
  children: React.ReactNode;
}

export default function DesignShell({ children }: DesignShellProps) {
  const pathname = usePathname();
  const isEditorPage = pathname.startsWith('/editor/');

  return (
    <div className="flex h-svh flex-col overflow-hidden">
      {!isEditorPage && <Header />}
      <div className={cn('flex flex-1 overflow-hidden', !isEditorPage && 'pt-16')}>
        {isEditorPage ? (
          // Editor page — no smooth scrolling, overflow hidden
          <main className="flex-1 overflow-hidden">{children}</main>
        ) : (
          // All other pages — Lenis smooth scrolling on the main container
          <SmoothScroll className="flex-1 overflow-auto p-4 sm:p-6 lg:p-8">
            {children}
          </SmoothScroll>
        )}
      </div>
    </div>
  );
}
