'use client';

import { useEffect, useRef, ReactNode } from 'react';
import Lenis from 'lenis';

/**
 * Wraps a scrollable element and applies Lenis smooth scrolling to it.
 *
 * Usage:
 *   <SmoothScroll>
 *     <main className="overflow-auto">...</main>
 *   </SmoothScroll>
 *
 * Lenis is attached to the wrapper div (which must be the scroll
 * container — i.e. have `overflow: auto/scroll`). The rAF loop is
 * cleaned up on unmount.
 *
 * On touch devices Lenis is disabled by default (syncTouch: false) so
 * native momentum scrolling is preserved — only desktop gets the
 * smoothed wheel scrolling.
 */

export interface SmoothScrollProps {
  children: ReactNode;
  /** Extra class names for the wrapper div */
  className?: string;
}

export default function SmoothScroll({ children, className }: SmoothScrollProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const lenisRef = useRef<Lenis | null>(null);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;

    const lenis = new Lenis({
      wrapper: el,
      content: el,
      // Smooth wheel scrolling on desktop; native touch on mobile
      syncTouch: false,
      // Duration of the smooth scroll in seconds
      duration: 1.2,
      // Easing function — ease-out-expo
      easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      // Don't hijack horizontal scroll
      orientation: 'vertical',
      // Prevent smooth scroll from fighting with browser back/forward
      smoothWheel: true,
    });

    lenisRef.current = lenis;

    let rafId = 0;
    function raf(time: number) {
      lenis.raf(time);
      rafId = requestAnimationFrame(raf);
    }
    rafId = requestAnimationFrame(raf);

    return () => {
      cancelAnimationFrame(rafId);
      lenis.destroy();
      lenisRef.current = null;
    };
  }, []);

  return (
    <div ref={wrapperRef} className={className}>
      {children}
    </div>
  );
}
