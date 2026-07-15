'use client';

import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils/cn';
import Header from './Header';

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
        <main
          className={cn(
            'flex-1',
            isEditorPage ? 'overflow-hidden' : 'overflow-auto',
            !isEditorPage && 'p-4 sm:p-6 lg:p-8'
          )}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
