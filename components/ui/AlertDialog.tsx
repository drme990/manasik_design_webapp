'use client';

import { cn } from '@/lib/utils/cn';
import { LuTriangleAlert, LuInfo, LuCircleAlert } from 'react-icons/lu';
import Button from './Button';
import Modal from './Modal';
import { useTranslations } from '@/lib/i18n/strings';

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

  const iconMap = {
    danger: LuTriangleAlert,
    warning: LuCircleAlert,
    info: LuInfo,
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
          {(() => {
            const Icon = iconMap[variant];
            return <Icon className="h-6 w-6" />;
          })()}
        </div>
        <p className="text-secondary">{description}</p>
      </div>
    </Modal>
  );
}

export { AlertDialog };