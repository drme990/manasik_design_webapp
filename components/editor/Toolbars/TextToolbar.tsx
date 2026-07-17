'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { TextArea } from '@/components/ui/TextArea';
import { Dropdown, DropdownItem } from '@/components/ui/Dropdown';
import SliderField from '@/components/ui/SliderField';
import ColorPicker from '@/components/ui/ColorPicker';
import { cn } from '@/lib/utils/cn';
import { ARABIC_SAFE_FONTS } from '@/lib/constants/arabic-fonts';
import { resolveFontFamily } from '@/lib/constants/fonts';
import { useTranslations } from '@/lib/i18n/strings';
import { LuChevronDown, LuCheck } from 'react-icons/lu';
import type { TextLayer } from '@/types';

export interface TextToolbarProps {
  layer: TextLayer;
  onChange: (updates: Partial<TextLayer>) => void;
  onSliderStart?: () => void;
  className?: string;
}

const TRIGGER_BTN =
  'flex w-full items-center justify-between rounded-lg border border-stroke bg-background px-4 py-2.5 text-foreground transition-all duration-200 hover:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary';

export default function TextToolbar({ layer, onChange, onSliderStart, className }: TextToolbarProps) {
  const t = useTranslations('editor.toolbars.text');
  const [recentColors, setRecentColors] = useState<string[]>([]);

  const addRecentColor = (color: string) => {
    setRecentColors((prev) => {
      const filtered = prev.filter((c) => c.toLowerCase() !== color.toLowerCase());
      return [color, ...filtered].slice(0, 10);
    });
  };

  const fontItems: DropdownItem[] = ARABIC_SAFE_FONTS.map((font) => ({
    id: font.id,
    label: font.name,
    onClick: () => onChange({ fontFamily: font.family, fontWeight: font.weight }),
  }));

  const alignItems: DropdownItem[] = [
    { id: 'left', label: t('left'), onClick: () => onChange({ align: 'left' }) },
    { id: 'center', label: t('center'), onClick: () => onChange({ align: 'center' }) },
    { id: 'right', label: t('right'), onClick: () => onChange({ align: 'right' }) },
  ];

  const vAlignItems: DropdownItem[] = [
    { id: 'top', label: t('top'), onClick: () => onChange({ verticalAlign: 'top' }) },
    { id: 'middle', label: t('middle'), onClick: () => onChange({ verticalAlign: 'middle' }) },
    { id: 'bottom', label: t('bottom'), onClick: () => onChange({ verticalAlign: 'bottom' }) },
  ];

  const selectedFont = ARABIC_SAFE_FONTS.find((f) => f.family === layer.fontFamily && f.weight === (layer.fontWeight || 400));
  const selectedAlign = layer.align;
  const selectedVAlign = layer.verticalAlign;

  const renderItem = (item: DropdownItem, isSelected: boolean) => {
    const font = ARABIC_SAFE_FONTS.find((f) => f.id === item.id);
    const isSelectedFont = font && font.family === layer.fontFamily && font.weight === (layer.fontWeight || 400);
    return (
      <span className="flex w-full items-center justify-between">
        <span
          className="truncate"
          style={isSelectedFont ? { fontFamily: resolveFontFamily(font.family), fontWeight: font.weight } : undefined}
        >
          {item.label}
        </span>
        {isSelected && <LuCheck className="ms-2 h-4 w-4 shrink-0 text-brand-primary" />}
      </span>
    );
  };

  return (
    <div className={cn('space-y-4 rounded-lg border border-stroke bg-card-bg p-4', className)}>
      <h3 className="text-sm font-semibold text-foreground">{t('title')}</h3>

      <TextArea
        label={t('text')}
        value={layer.text}
        onChange={(e) => onChange({ text: e.target.value })}
        rows={3}
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
                style={{ fontFamily: resolveFontFamily(layer.fontFamily), fontWeight: layer.fontWeight || 400 }}
              >
                {selectedFont?.name || layer.fontFamily}
              </span>
              <LuChevronDown className="ms-2 h-5 w-5 shrink-0 text-secondary" />
            </button>
          }
          items={fontItems.map((item) => {
            const font = ARABIC_SAFE_FONTS.find((f) => f.id === item.id);
            const isSelectedFont = font && font.family === layer.fontFamily && font.weight === (layer.fontWeight || 400);
            return {
              ...item,
              label: undefined as unknown as string,
              icon: renderItem(item, !!isSelectedFont),
            };
          })}
        />
      </div>

      <SliderField
        label={t('size')}
        value={layer.fontSize}
        min={1}
        max={300}
        onChange={(v) => onChange({ fontSize: v })}
        onDragStart={onSliderStart}
      />

      <SliderField
        label={t('lineHeight')}
        value={layer.lineHeight}
        min={0.5}
        max={2.5}
        step={0.1}
        onChange={(v) => onChange({ lineHeight: v })}
        onDragStart={onSliderStart}
      />

      <SliderField
        label={t('opacity')}
        value={layer.opacity * 100}
        min={0}
        max={100}
        onChange={(v) => onChange({ opacity: v / 100 })}
        onDragStart={onSliderStart}
        suffix="%"
      />

      <div className="grid grid-cols-2 gap-3">
        {/* Align dropdown */}
        <div className="w-full">
          <label className="mb-1.5 block text-sm font-medium text-foreground">{t('align')}</label>
          <Dropdown
            align="left"
            className="w-full"
            trigger={
              <button type="button" className={TRIGGER_BTN}>
                <span className="truncate text-start">
                  {selectedAlign === 'left' ? t('left') : selectedAlign === 'center' ? t('center') : t('right')}
                </span>
                <LuChevronDown className="ms-2 h-5 w-5 shrink-0 text-secondary" />
              </button>
            }
            items={alignItems.map((item) => ({
              ...item,
              label: undefined as unknown as string,
              icon: renderItem(item, item.id === selectedAlign),
            }))}
          />
        </div>

        {/* Vertical align dropdown */}
        <div className="w-full">
          <label className="mb-1.5 block text-sm font-medium text-foreground">{t('vAlign')}</label>
          <Dropdown
            align="left"
            className="w-full"
            trigger={
              <button type="button" className={TRIGGER_BTN}>
                <span className="truncate text-start">
                  {selectedVAlign === 'top' ? t('top') : selectedVAlign === 'bottom' ? t('bottom') : t('middle')}
                </span>
                <LuChevronDown className="ms-2 h-5 w-5 shrink-0 text-secondary" />
              </button>
            }
            items={vAlignItems.map((item) => ({
              ...item,
              label: undefined as unknown as string,
              icon: renderItem(item, item.id === selectedVAlign),
            }))}
          />
        </div>
      </div>

      <div>
        <ColorPicker
          label={t('color')}
          value={layer.color}
          onChange={(color) => onChange({ color })}
          recent={recentColors}
          onRecentAdd={addRecentColor}
        />
      </div>

      <div className="flex gap-2">
        <Button
          variant={layer.bold ? 'primary' : 'ghost'}
          onClick={() => onChange({ bold: !layer.bold })}
          className="flex-1"
        >
          {t('bold')}
        </Button>
        <Button
          variant={layer.italic ? 'primary' : 'ghost'}
          onClick={() => onChange({ italic: !layer.italic })}
          className="flex-1"
        >
          {t('italic')}
        </Button>
      </div>
    </div>
  );
}
