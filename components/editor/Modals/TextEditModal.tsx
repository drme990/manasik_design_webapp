'use client';

import { useState, useEffect } from 'react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import { TextArea } from '@/components/ui/TextArea';
import { Dropdown, DropdownItem } from '@/components/ui/Dropdown';
import { ARABIC_SAFE_FONTS } from '@/lib/constants/arabic-fonts';
import { resolveFontFamily } from '@/lib/constants/fonts';
import { useTranslations } from '@/lib/i18n/strings';
import { LuChevronDown, LuCheck } from 'react-icons/lu';

const TRIGGER_BTN =
  'flex w-full items-center justify-between rounded-lg border border-stroke bg-background px-4 py-2.5 text-foreground transition-all duration-200 hover:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary';

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

  const fontItems: DropdownItem[] = ARABIC_SAFE_FONTS.map((font) => ({
    id: font.id,
    label: font.name,
    onClick: () => setFontFamily(font.id),
  }));

  const selectedFont = ARABIC_SAFE_FONTS.find((f) => f.id === fontFamily);

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

        {/* Font dropdown */}
        <div className="w-full">
          <label className="mb-1.5 block text-sm font-medium text-foreground">{t('font')}</label>
          <Dropdown
            align="left"
            className="w-full"
            trigger={
              <button type="button" className={TRIGGER_BTN}>
                <span
                  className="truncate text-start"
                  style={{ fontFamily: resolveFontFamily(fontFamily) }}
                >
                  {selectedFont?.name || fontFamily}
                </span>
                <LuChevronDown className="ms-2 h-5 w-5 shrink-0 text-secondary" />
              </button>
            }
            items={fontItems.map((item) => ({
              ...item,
              label: undefined as unknown as string,
              icon: (
                <span className="flex w-full items-center justify-between">
                  <span style={{ fontFamily: resolveFontFamily(item.id) }}>{item.label}</span>
                  {item.id === fontFamily && <LuCheck className="ms-2 h-4 w-4 shrink-0 text-brand-primary" />}
                </span>
              ),
            }))}
          />
        </div>

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
