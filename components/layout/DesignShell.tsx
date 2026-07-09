'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils/cn';
import Header from './Header';
import Sidebar from './Sidebar';

export interface DesignShellProps {
  children: React.ReactNode;
}

export default function DesignShell({ children }: DesignShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();
  const isEditorPage = pathname.startsWith('/editor/');

  // Open the sidebar by default on large screens, keep it closed on mobile.
  useEffect(() => {
    const mql = window.matchMedia('(min-width: 1024px)');
    setSidebarOpen(mql.matches);

    const handler = (e: MediaQueryListEvent) => setSidebarOpen(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  return (
    <div className="flex h-svh flex-col overflow-hidden">
      {!isEditorPage && <Header onMenuClick={() => setSidebarOpen((prev) => !prev)} />}
      <div className={cn('flex flex-1 overflow-hidden', !isEditorPage && 'pt-16')}>
        {/* Sidebar is first in source order so it sits on the start side: left in LTR, right in RTL. */}
        {!isEditorPage && <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />}
        <main
          className={cn(
            'flex-1 overflow-auto',
            !isEditorPage && 'p-4 sm:p-6 lg:p-8'
          )}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
