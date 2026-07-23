'use client';

import { useEffect, useRef, ReactNode } from 'react';
import Lenis from 'lenis';

/**
 * Wraps a scrollable element and applies Lenis smooth scrolling to it.
 *
 * Usage:
 *   <SmoothScroll className="overflow-auto">
 *     {children}
 *   </SmoothScroll>
 *
 * The wrapper div becomes the Lenis scroll container. The rAF loop
 * is cleaned up on unmount.
 *
 * Smooth scrolling is enabled on both desktop (wheel) and mobile
 * (touch) via syncTouch: true. The syncTouchLerp controls the inertia
 * strength on touch — a lower value keeps mobile feeling responsive
 * while still adding smoothness.
 */

export interface SmoothScrollProps {
  children: ReactNode;
  /** Extra class names for the wrapper div (must include overflow-auto) */
  className?: string;
}

export default function SmoothScroll({ children, className }: SmoothScrollProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;

    const lenis = new Lenis({
      wrapper: el,
      content: el,
      // Smooth scrolling on both desktop and mobile
      syncTouch: true,
      // Inertia strength for touch scrolling (0 = instant, 1 = max)
      // Lower value keeps mobile feeling snappy while still smooth
      syncTouchLerp: 0.075,
      // Duration of the smooth scroll in seconds (wheel/keyboard)
      duration: 1.2,
      // Easing function — ease-out-expo
      easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      // Vertical only — don't hijack horizontal scroll carousels
      orientation: 'vertical',
      // Smooth wheel scrolling on desktop
      smoothWheel: true,
    });

    let rafId = 0;
    function raf(time: number) {
      lenis.raf(time);
      rafId = requestAnimationFrame(raf);
    }
    rafId = requestAnimationFrame(raf);

    return () => {
      cancelAnimationFrame(rafId);
      lenis.destroy();
    };
  }, []);

  return (
    <div
      ref={wrapperRef}
      className={className}
      style={{ WebkitOverflowScrolling: 'touch' }}
    >
      {children}
    </div>
  );
}
