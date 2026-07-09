'use client';

import { useState } from 'react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import ColorPicker from '@/components/common/ColorPicker';
import { pickColor } from '@/lib/utils/eyedropper';
import { useTranslations } from 'next-intl';

export interface ColorPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialColor?: string;
  onSelect: (color: string) => void;
}

export default function ColorPickerModal({
  isOpen,
  onClose,
  initialColor = '#000000',
  onSelect,
}: ColorPickerModalProps) {
  const [color, setColor] = useState(initialColor);
  const t = useTranslations('editor.modals.colorPicker');
  const uiT = useTranslations('ui');

  const handleEyedropper = async () => {
    const pickedColor = await pickColor();
    if (pickedColor) {
      setColor(pickedColor);
    }
  };

  const handleSave = () => {
    onSelect(color);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('title')}
      size="md"
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
      <ColorPicker
        color={color}
        onChange={setColor}
        showEyedropper
        onEyedropper={handleEyedropper}
      />
    </Modal>
  );
}
