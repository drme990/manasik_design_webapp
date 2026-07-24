'use client';

import { usePathname } from 'next/navigation';
import Header from './Header';

export interface DesignShellProps {
  children: React.ReactNode;
}

export default function DesignShell({ children }: DesignShellProps) {
  const pathname = usePathname();
  const isEditorPage = pathname.startsWith('/editor/');

  if (isEditorPage) {
    // Editor page — no header, no padding, overflow hidden.
    // SmoothScroll (in the layout) skips Lenis init on editor pages.
    return (
      <div className="flex h-svh flex-col overflow-hidden">
        <main className="flex-1 overflow-hidden">{children}</main>
      </div>
    );
  }

  // All other pages — header + padded content area.
  // SmoothScroll (in the layout) provides Lenis smooth scrolling.
  return (
    <>
      <Header />
      <div className="pt-16">
        <main className="p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </>
  );
}
