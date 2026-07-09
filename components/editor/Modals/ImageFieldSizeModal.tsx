'use client';

import { useState } from 'react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useTranslations } from 'next-intl';

export interface ImageFieldSizeModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialWidth?: number;
  initialHeight?: number;
  onSave: (width: number, height: number) => void;
}

export default function ImageFieldSizeModal({
  isOpen,
  onClose,
  initialWidth = 200,
  initialHeight = 200,
  onSave,
}: ImageFieldSizeModalProps) {
  const [width, setWidth] = useState(initialWidth);
  const [height, setHeight] = useState(initialHeight);
  const t = useTranslations('editor.modals.imageFieldSize');
  const uiT = useTranslations('ui');

  const handleSave = () => {
    onSave(width, height);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('title')}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {uiT('cancel')}
          </Button>
          <Button variant="primary" onClick={handleSave}>
            {uiT('save')}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-4">
        <Input
          label={t('width')}
          type="number"
          value={width}
          onChange={(e) => setWidth(Number(e.target.value))}
        />
        <Input
          label={t('height')}
          type="number"
          value={height}
          onChange={(e) => setHeight(Number(e.target.value))}
        />
      </div>
    </Modal>
  );
}
