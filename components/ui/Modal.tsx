'use client';

import { ReactNode } from 'react';
import Button from './Button';
import { cn } from '@/lib/utils/cn';
import { useTranslations } from 'next-intl';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  hideCloseButton?: boolean;
}

export default function Modal({
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  hideCloseButton = false,
}: ModalProps) {
  const t = useTranslations('ui');
  if (!isOpen) return null;

  const sizeClasses = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        className={cn(
          'relative w-full rounded-xl bg-card-bg border border-stroke shadow-2xl',
          sizeClasses[size]
        )}
        role="dialog"
        aria-modal="true"
      >
        {(title || !hideCloseButton) && (
          <div className="flex items-center justify-between border-b border-stroke px-6 py-4">
            <div>
              {title && (
                <h2 className="text-xl font-semibold text-foreground">
                  {title}
                </h2>
              )}
              {description && (
                <p className="mt-1 text-sm text-secondary">
                  {description}
                </p>
              )}
            </div>
            {!hideCloseButton && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onClose}
                className="rounded-full p-2"
                aria-label={t('close')}
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </Button>
            )}
          </div>
        )}
        <div className="px-6 py-5">{children}</div>
        {footer && (
          <div className="flex justify-end gap-3 border-t border-stroke px-6 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export { Modal };