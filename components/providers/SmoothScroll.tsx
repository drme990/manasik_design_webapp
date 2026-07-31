'use client';

import { type ReactNode, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import Lenis from 'lenis';

export default function SmoothScrollProvider({
  children,
}: {
  children: ReactNode;
}) {
  const pathname = usePathname();
  const lenisRef = useRef<Lenis | null>(null);

  useEffect(() => {
    // Skip Lenis on editor pages — they use overflow-hidden and handle
    // their own scrolling/zooming internally.
    if (pathname.startsWith('/editor/')) return;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }

    const lenis = new Lenis({
      lerp: 0.09,
      smoothWheel: true,
    });
    lenisRef.current = lenis;

    let frameId = 0;

    const raf = (time: number) => {
      lenis.raf(time);
      frameId = window.requestAnimationFrame(raf);
    };

    frameId = window.requestAnimationFrame(raf);

    // Lenis doesn't auto-detect content height changes. When async data
    // loads (project lists, images, etc.) the page grows taller but Lenis
    // still uses the old scroll dimensions — so scrolling stops short of
    // the real bottom. A ResizeObserver on <body> recalculates whenever
    // the content height changes.
    const resizeObserver = new ResizeObserver(() => {
      lenis.resize();
    });
    resizeObserver.observe(document.body);
    // Also observe the html element — some layouts set height on <html>.
    resizeObserver.observe(document.documentElement);

    const scrollToHash = (hash: string) => {
      if (!hash || !lenisRef.current) return;
      const targetId = hash.startsWith('#') ? hash.slice(1) : hash;
      if (!targetId) return;

      let tries = 0;
      const tryScroll = () => {
        const target = document.getElementById(targetId);
        if (target) {
          lenisRef.current?.scrollTo(target);
          return;
        }

        tries += 1;
        if (tries < 24) {
          window.requestAnimationFrame(tryScroll);
        }
      };

      tryScroll();
    };

    const handleHashChange = () => {
      scrollToHash(window.location.hash);
    };

    const handleDocumentClick = (event: MouseEvent) => {
      const target = event.target as Element | null;
      const anchor = target?.closest('a[href]') as HTMLAnchorElement | null;
      if (!anchor) return;

      const href = anchor.getAttribute('href');
      if (!href) return;

      const url = new URL(href, window.location.origin);
      if (url.origin !== window.location.origin) return;
      if (url.pathname !== window.location.pathname) return;
      if (!url.hash) return;

      event.preventDefault();
      window.history.pushState({}, '', url.hash);
      scrollToHash(url.hash);
    };

    window.addEventListener('hashchange', handleHashChange);
    document.addEventListener('click', handleDocumentClick);

    if (window.location.hash) {
      scrollToHash(window.location.hash);
    }

    return () => {
      window.removeEventListener('hashchange', handleHashChange);
      document.removeEventListener('click', handleDocumentClick);
      resizeObserver.disconnect();
      window.cancelAnimationFrame(frameId);
      lenis.destroy();
      lenisRef.current = null;
    };
  }, [pathname]);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }

    if (pathname === '/' && window.location.hash) {
      lenisRef.current?.scrollTo(window.location.hash);
    }
  }, [pathname]);

  return children;
}
