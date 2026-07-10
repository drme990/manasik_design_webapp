'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import NumberField from '@/components/ui/NumberField';
import SliderField from '@/components/ui/SliderField';
import ColorPicker from '@/components/ui/ColorPicker';
import { cn } from '@/lib/utils/cn';
import { ARABIC_SAFE_FONTS } from '@/lib/constants/arabic-fonts';
import { useTranslations } from 'next-intl';
import type { TextLayer } from '@/types';

export interface TextToolbarProps {
  layer: TextLayer;
  onChange: (updates: Partial<TextLayer>) => void;
  onSliderStart?: () => void;
  className?: string;
}

export default function TextToolbar({ layer, onChange, onSliderStart, className }: TextToolbarProps) {
  const t = useTranslations('editor.toolbars.text');

  const fontOptions = ARABIC_SAFE_FONTS.map((font) => ({
    value: font.id,
    label: font.name,
  }));

  const alignOptions = [
    { value: 'left', label: t('left') },
    { value: 'center', label: t('center') },
    { value: 'right', label: t('right') },
  ];
  const [recentColors, setRecentColors] = useState<string[]>([]);

  const addRecentColor = (color: string) => {
    setRecentColors((prev) => {
      const filtered = prev.filter((c) => c.toLowerCase() !== color.toLowerCase());
      return [color, ...filtered].slice(0, 10);
    });
  };

  return (
    <div className={cn('space-y-4 rounded-lg border border-stroke bg-card-bg p-4', className)}>
      <h3 className="text-sm font-semibold text-foreground">{t('title')}</h3>

      <Input
        label={t('text')}
        value={layer.text}
        onChange={(e) => onChange({ text: e.target.value })}
      />

      <Select
        label={t('font')}
        value={layer.fontFamily}
        options={fontOptions}
        onChange={(e) => onChange({ fontFamily: e.target.value })}
      />

      <div className="grid grid-cols-2 gap-3">
        <NumberField
          label={t('size')}
          value={layer.fontSize}
          min={1}
          max={500}
          onChange={(v) => onChange({ fontSize: v })}
        />
        <NumberField
          label={t('lineHeight')}
          value={layer.lineHeight}
          min={0.1}
          max={5}
          step={0.1}
          onChange={(v) => onChange({ lineHeight: v })}
        />
      </div>

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
        <Select
          label={t('align')}
          value={layer.align}
          options={alignOptions}
          onChange={(e) => onChange({ align: e.target.value as 'left' | 'center' | 'right' })}
        />
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
