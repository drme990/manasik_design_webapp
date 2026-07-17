'use client';

import { ReactNode, useEffect, useState, useRef } from 'react';
import { LuX } from 'react-icons/lu';
import Button from './Button';
import { cn } from '@/lib/utils/cn';
import { useTranslations } from '@/lib/i18n/strings';

export interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  /** Vertical position of the drawer. Defaults to 'bottom'. */
  side?: 'bottom' | 'top' | 'left' | 'right';
  /** Height fraction of the viewport. Only applies to bottom/top. Defaults to 'half'. */
  height?: 'auto' | 'half' | 'full' | 'twoThirds';
  hideCloseButton?: boolean;
  /** Optional "Done" button shown in the header (top-right). */
  onDone?: () => void;
  doneLabel?: string;
  /** Optional custom actions rendered in the header (right side, before Done). */
  headerActions?: ReactNode;
}

const HEIGHT_CLASSES = {
  auto: 'max-h-[90svh]',
  half: 'h-[50svh]',
  full: 'h-[90svh]',
  twoThirds: 'h-[65svh]',
};

const SIDE_CLASSES = {
  bottom: 'items-end',
  top: 'items-start',
  left: 'justify-start',
  right: 'justify-end',
};

const PANEL_CLASSES = {
  bottom: 'w-full rounded-t-2xl',
  top: 'w-full rounded-b-2xl',
  left: 'h-full rounded-r-2xl',
  right: 'h-full rounded-l-2xl',
};

// Hidden transform per side — the panel starts/ends here
const HIDDEN_TRANSFORMS: Record<string, string> = {
  bottom: 'translateY(100%)',
  top: 'translateY(-100%)',
  left: 'translateX(-100%)',
  right: 'translateX(100%)',
};

const TRANSITION_DURATION = 320;

export default function Drawer({
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
  side = 'bottom',
  height = 'half',
  hideCloseButton = false,
  onDone,
  doneLabel,
  headerActions,
}: DrawerProps) {
  const t = useTranslations('ui');

  // `mounted` keeps the DOM node alive during exit animation.
  // `visible` drives the actual CSS transition (added one tick after mount).
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isOpen) {
      // Opening: mount immediately, then trigger transition on next frame
      if (closeTimer.current) {
        clearTimeout(closeTimer.current);
        closeTimer.current = null;
      }
      setMounted(true);
      const raf = requestAnimationFrame(() => {
        // Double rAF ensures the browser paints the initial state first
        requestAnimationFrame(() => setVisible(true));
      });
      return () => cancelAnimationFrame(raf);
    } else {
      // Closing: start exit transition, unmount after it finishes
      setVisible(false);
      closeTimer.current = setTimeout(() => setMounted(false), TRANSITION_DURATION);
    }
  }, [isOpen]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  if (!mounted) return null;

  const isVertical = side === 'bottom' || side === 'top';
  const hiddenTransform = HIDDEN_TRANSFORMS[side];

  return (
    <div className={cn('fixed inset-0 z-50 flex', SIDE_CLASSES[side])}>
      {/* Backdrop — fades in/out */}
      <div
        className={cn(
          'absolute inset-0 bg-black/50 transition-opacity ease-out',
          visible ? 'duration-300 opacity-100' : 'duration-200 opacity-0'
        )}
        onClick={onClose}
      />
      {/* Panel — slides in/out */}
      <div
        className={cn(
          'relative flex flex-col bg-card-bg border border-stroke shadow-2xl',
          'transition-transform ease-[cubic-bezier(0.32,0.72,0,1)]',
          visible ? 'duration-300' : 'duration-200',
          PANEL_CLASSES[side],
          isVertical && HEIGHT_CLASSES[height],
          side === 'left' && 'max-w-sm',
          side === 'right' && 'max-w-sm',
        )}
        style={{
          transform: visible ? 'translate(0, 0)' : hiddenTransform,
        }}
        role="dialog"
        aria-modal="true"
      >
        {/* Drag handle for bottom/top drawers */}
        {isVertical && (
          <div className="flex justify-center pt-3 pb-1">
            <div className="h-1.5 w-12 rounded-full bg-stroke" />
          </div>
        )}

        {(title || !hideCloseButton || onDone || headerActions) && (
          <div className="flex items-center gap-3 border-b border-stroke px-4 py-3">
            {/* Close button — left */}
            {!hideCloseButton && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onClose}
                className="rounded-full p-2 hover:bg-error/10"
                aria-label={t('close')}
              >
                <LuX className="h-5 w-5 text-error" />
              </Button>
            )}

            {/* Title — left-aligned when no actions, centered when actions present */}
            <div className={`flex-1 ${(onDone || headerActions) ? 'text-center' : 'text-start'}`}>
              {title && (
                <h2 className="text-base font-semibold text-foreground">
                  {title}
                </h2>
              )}
              {description && (
                <p className="mt-0.5 text-sm text-secondary">
                  {description}
                </p>
              )}
            </div>

            {/* Custom header actions — right side, before Done */}
            {headerActions && (
              <div className="flex items-center gap-1">
                {headerActions}
              </div>
            )}

            {/* Done button — right */}
            {onDone && (
              <Button
                variant="primary"
                size="sm"
                onClick={onDone}
                className="rounded-lg px-4"
              >
                {doneLabel || t('done')}
              </Button>
            )}
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>

        {footer && (
          <div className="flex justify-end gap-3 border-t border-stroke px-6 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export { Drawer };
