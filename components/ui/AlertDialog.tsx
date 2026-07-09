'use client';

import { cn } from '@/lib/utils/cn';
import Button from './Button';
import Modal from './Modal';
import { useTranslations } from 'next-intl';

export interface AlertDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'info';
  loading?: boolean;
}

export default function AlertDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel,
  cancelLabel,
  variant = 'danger',
  loading = false,
}: AlertDialogProps) {
  const t = useTranslations('ui');
  const variantStyles = {
    danger: 'text-error',
    warning: 'text-warning',
    info: 'text-info',
  };

  const iconPaths = {
    danger: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z',
    warning: 'M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
    info: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="sm"
      hideCloseButton
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {cancelLabel ?? t('cancel')}
          </Button>
          <Button
            variant={variant === 'danger' ? 'danger' : 'primary'}
            onClick={onConfirm}
            loading={loading}
          >
            {confirmLabel ?? t('confirm')}
          </Button>
        </>
      }
    >
      <div className="flex items-start gap-4">
        <div className={cn('mt-1 shrink-0', variantStyles[variant])}>
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={iconPaths[variant]} />
          </svg>
        </div>
        <p className="text-secondary">{description}</p>
      </div>
    </Modal>
  );
}

export { AlertDialog };