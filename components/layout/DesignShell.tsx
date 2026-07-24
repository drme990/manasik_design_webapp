'use client';

import { usePathname } from 'next/navigation';
import Header from './Header';
import SmoothScroll from '@/components/providers/SmoothScroll';

export interface DesignShellProps {
  children: React.ReactNode;
}

export default function DesignShell({ children }: DesignShellProps) {
  const pathname = usePathname();
  const isEditorPage = pathname.startsWith('/editor/');

  if (isEditorPage) {
    // Editor page — no smooth scrolling, overflow hidden
    return (
      <div className="flex h-svh flex-col overflow-hidden">
        <main className="flex-1 overflow-hidden">{children}</main>
      </div>
    );
  }

  // All other pages — Lenis smooth scrolling on the window
  return (
    <SmoothScroll>
      <Header />
      <div className="pt-16">
        <main className="p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </SmoothScroll>
  );
}
