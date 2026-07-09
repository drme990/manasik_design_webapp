'use client';

import { useState, useEffect } from 'react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import FileUpload from '@/components/ui/FileUpload';
import { useTranslations } from 'next-intl';
import type { CollageCell } from '@/types/collage';

export interface CollageCellEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  cell: CollageCell | null;
  cellIndex: number;
  onSave: (index: number, updates: Partial<CollageCell>) => void;
}

export default function CollageCellEditorModal({
  isOpen,
  onClose,
  cell,
  cellIndex,
  onSave,
}: CollageCellEditorModalProps) {
  const t = useTranslations('common.collageCellEditor');
  const uiT = useTranslations('ui');
  const [uri, setUri] = useState(cell?.uri || '');

  useEffect(() => {
    setUri(cell?.uri || '');
  }, [cell, isOpen]);

  const handleFilesSelected = (files: File[]) => {
    const file = files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setUri(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSave = () => {
    onSave(cellIndex, { uri });
    onClose();
  };

  const handleClear = () => {
    setUri('');
    onSave(cellIndex, { uri: '' });
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('title', { index: cellIndex + 1 })}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={handleClear}>
            {t('clearImage')}
          </Button>
          <Button variant="primary" onClick={handleSave}>
            {uiT('save')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {uri ? (
          <div className="relative aspect-square w-full overflow-hidden rounded-lg border border-stroke bg-muted">
            <img src={uri} alt={t('selectedImageAlt')} className="h-full w-full object-contain" />
            <button
              onClick={() => setUri('')}
              className="absolute top-2 right-2 rounded-full bg-error p-1 text-white"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ) : (
          <FileUpload
            accept="image/*"
            onFilesSelected={handleFilesSelected}
          />
        )}
      </div>
    </Modal>
  );
}