'use client';

import { cn } from '@/lib/utils/cn';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import { useTranslations } from 'next-intl';
import type { ConflictResolution } from '@/types';

export interface ConflictDialogProps {
  isOpen: boolean;
  onResolve: (resolution: 'local' | 'remote' | 'merge') => void;
  onClose: () => void;
  documentId?: string;
}

export default function ConflictDialog({
  isOpen,
  onResolve,
  onClose,
  documentId,
}: ConflictDialogProps) {
  const t = useTranslations('sync.conflict');

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('title')}
      description={documentId ? `${t('document')}: ${documentId}` : undefined}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button variant="outline" onClick={() => onResolve('remote')}>
            {t('useRemote')}
          </Button>
          <Button variant="secondary" onClick={() => onResolve('merge')}>
            {t('merge')}
          </Button>
          <Button variant="primary" onClick={() => onResolve('local')}>
            {t('useLocal')}
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-foreground">
        <p className="text-secondary">
          {t('description')}
        </p>
        <div className="space-y-2 rounded-lg border border-stroke bg-muted/30 p-4">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-brand-primary" />
            <span className="text-sm font-medium">{t('local')}</span>
          </div>
          <p className="text-xs text-secondary">
            {t('localDescription')}
          </p>
          <div className="flex items-center gap-2 pt-2">
            <span className="h-2 w-2 rounded-full bg-brand-secondary" />
            <span className="text-sm font-medium">{t('remote')}</span>
          </div>
          <p className="text-xs text-secondary">
            {t('remoteDescription')}
          </p>
          <div className="flex items-center gap-2 pt-2">
            <span className="h-2 w-2 rounded-full bg-success" />
            <span className="text-sm font-medium">{t('merge')}</span>
          </div>
          <p className="text-xs text-secondary">
            {t('mergeDescription')}
          </p>
        </div>
      </div>
    </Modal>
  );
}
