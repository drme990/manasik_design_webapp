'use client';

import { useState, useEffect } from 'react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import { TextArea } from '@/components/ui/TextArea';
import { Select } from '@/components/ui/Select';
import { ARABIC_SAFE_FONTS } from '@/lib/constants/arabic-fonts';
import { useTranslations } from 'next-intl';

export interface TextEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialText?: string;
  initialFontFamily?: string;
  initialFontSize?: number;
  initialColor?: string;
  onSave: (text: string, fontFamily: string, fontSize: number, color: string) => void;
}

export default function TextEditModal({
  isOpen,
  onClose,
  initialText = '',
  initialFontFamily,
  initialFontSize = 24,
  initialColor = '#000000',
  onSave,
}: TextEditModalProps) {
  const [text, setText] = useState(initialText);
  const [fontFamily, setFontFamily] = useState(initialFontFamily || ARABIC_SAFE_FONTS[0].id);
  const [fontSize, setFontSize] = useState(initialFontSize);
  const [color, setColor] = useState(initialColor);
  const t = useTranslations('editor.modals.textEdit');
  const uiT = useTranslations('ui');

  useEffect(() => {
    setText(initialText);
    setFontFamily(initialFontFamily || ARABIC_SAFE_FONTS[0].id);
    setFontSize(initialFontSize);
    setColor(initialColor);
  }, [isOpen, initialText, initialFontFamily, initialFontSize, initialColor]);

  const fontOptions = ARABIC_SAFE_FONTS.map((font) => ({
    value: font.id,
    label: font.name,
  }));

  const handleSave = () => {
    onSave(text, fontFamily, fontSize, color);
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
      <div className="space-y-4">
        <TextArea
          label={t('text')}
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
        />
        <Select
          label={t('font')}
          value={fontFamily}
          options={fontOptions}
          onChange={(e) => setFontFamily(e.target.value)}
        />
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">{t('size')}</label>
            <input
              type="number"
              value={fontSize}
              onChange={(e) => setFontSize(Number(e.target.value))}
              className="w-full rounded-lg border border-stroke bg-background px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-brand-primary"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">{t('color')}</label>
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="h-10 w-full cursor-pointer rounded-lg border border-stroke bg-background p-1"
            />
          </div>
        </div>
      </div>
    </Modal>
  );
}
