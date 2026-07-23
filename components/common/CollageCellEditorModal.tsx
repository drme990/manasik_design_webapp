'use client';

import { useState } from 'react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import FileUpload from '@/components/ui/FileUpload';
import { useTranslations } from '@/lib/i18n/strings';
import { useToast } from '@/components/providers/ToastProvider';
import { uploadImageWithProgress } from '@/lib/storage/upload';
import { LuX } from 'react-icons/lu';
import type { CollageCell } from '@/types/collage';
import Image from 'next/image';

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
  const toast = useToast();
  const [uri, setUri] = useState(cell?.uri || '');

  // Sync uri when cell or isOpen changes
  const [prevCell, setPrevCell] = useState(cell);
  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
  if (cell !== prevCell || isOpen !== prevIsOpen) {
    setPrevCell(cell);
    setPrevIsOpen(isOpen);
    setUri(cell?.uri || '');
  }

  const handleFilesSelected = async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    try {
      const { uri: uploadedUri } = await uploadImageWithProgress(
        file,
        toast,
        'جاري رفع الصورة...'
      );
      setUri(uploadedUri);
    } catch {
      // toast already shown by uploader
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
            <Image src={uri} alt={t('selectedImageAlt')} className="h-full w-full object-contain" width={100} height={100} />
            <button
              onClick={() => setUri('')}
              className="absolute top-2 right-2 rounded-full bg-error p-1 text-white"
            >
              <LuX className="h-4 w-4" />
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