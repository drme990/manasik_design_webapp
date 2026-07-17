'use client';

import { ReactNode, useEffect, useState, useRef } from 'react';
import { LuX } from 'react-icons/lu';
import Button from './Button';
import { cn } from '@/lib/utils/cn';
import { useTranslations } from '@/lib/i18n/strings';

export interface FullPageProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
  hideCloseButton?: boolean;
  onDone?: () => void;
  doneLabel?: string;
  doneIcon?: ReactNode;
  doneDisabled?: boolean;
}

const TRANSITION_DURATION = 300;

export default function FullPageDrawer({
  isOpen,
  onClose,
  title,
  children,
  footer,
  hideCloseButton = false,
  onDone,
  doneLabel,
  doneIcon,
  doneDisabled = false,
}: FullPageProps) {
  const t = useTranslations('ui');

  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isOpen) {
      if (closeTimer.current) {
        clearTimeout(closeTimer.current);
        closeTimer.current = null;
      }
      setMounted(true);
      const raf = requestAnimationFrame(() => {
        requestAnimationFrame(() => setVisible(true));
      });
      return () => cancelAnimationFrame(raf);
    } else {
      setVisible(false);
      closeTimer.current = setTimeout(() => setMounted(false), TRANSITION_DURATION);
    }
  }, [isOpen]);

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

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-card-bg">
      {/* Backdrop — fades in/out (subtle, since panel covers most of screen) */}
      <div
        className={cn(
          'absolute inset-0 bg-black/50 transition-opacity duration-300 ease-out',
          visible ? 'opacity-0' : 'opacity-100'
        )}
        onClick={onClose}
      />
      {/* Panel — slides up from bottom, full page */}
      <div
        className={cn(
          'relative flex h-full w-full flex-col bg-card-bg transition-transform duration-300 ease-out',
        )}
        style={{
          transform: visible ? 'translateY(0)' : 'translateY(100%)',
        }}
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        {(title || !hideCloseButton || onDone) && (
          <div className="flex shrink-0 items-center gap-3 border-b border-stroke px-4 py-3">
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

            <div className={`flex-1 ${onDone ? 'text-center' : 'text-start'}`}>
              {title && (
                <h2 className="text-base font-semibold text-foreground">
                  {title}
                </h2>
              )}
            </div>

            {onDone && (
              <Button
                variant="primary"
                size="sm"
                onClick={onDone}
                disabled={doneDisabled}
                className="rounded-lg p-2.5"
                aria-label={doneLabel || t('done')}
              >
                {doneIcon || doneLabel || t('done')}
              </Button>
            )}
          </div>
        )}

        {/* Content — scrollable */}
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>

        {/* Footer */}
        {footer && (
          <div className="flex shrink-0 justify-end gap-3 border-t border-stroke px-6 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export { FullPageDrawer };
