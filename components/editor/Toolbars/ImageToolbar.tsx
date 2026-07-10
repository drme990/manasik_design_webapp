'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import SliderField from '@/components/ui/SliderField';
import ColorPicker from '@/components/ui/ColorPicker';
import { LuFlipHorizontal, LuFlipVertical } from 'react-icons/lu';
import { cn } from '@/lib/utils/cn';
import { useTranslations } from 'next-intl';
import type { ImageLayer } from '@/types';

export interface ImageToolbarProps {
  layer: ImageLayer;
  onChange: (updates: Partial<ImageLayer>) => void;
  onSliderStart?: () => void;
  className?: string;
}

export default function ImageToolbar({ layer, onChange, onSliderStart, className }: ImageToolbarProps) {
  const t = useTranslations('editor.toolbars.image');
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

      <SliderField
        label={t('scale')}
        value={layer.imageScale}
        min={0.1}
        max={3}
        step={0.05}
        onChange={(v) => onChange({ imageScale: v })}
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

      <SliderField
        label={t('offsetX')}
        value={layer.offsetX}
        min={-500}
        max={500}
        onChange={(v) => onChange({ offsetX: v })}
        onDragStart={onSliderStart}
      />

      <SliderField
        label={t('offsetY')}
        value={layer.offsetY}
        min={-500}
        max={500}
        onChange={(v) => onChange({ offsetY: v })}
        onDragStart={onSliderStart}
      />

      <SliderField
        label={t('borderRadius')}
        value={layer.borderRadius}
        min={0}
        max={200}
        onChange={(v) => onChange({ borderRadius: v })}
        onDragStart={onSliderStart}
      />

      <SliderField
        label={t('borderWidth')}
        value={layer.borderWidth}
        min={0}
        max={50}
        onChange={(v) => onChange({ borderWidth: v })}
        onDragStart={onSliderStart}
      />

      <ColorPicker
        label={t('borderColor')}
        value={layer.borderColor}
        onChange={(color) => onChange({ borderColor: color })}
        recent={recentColors}
        onRecentAdd={addRecentColor}
      />

      <div className="flex gap-2">
        <Button
          variant={layer.flipX ? 'primary' : 'ghost'}
          onClick={() => onChange({ flipX: !layer.flipX })}
          className="flex-1 gap-1"
          aria-label={t('flipHorizontal')}
        >
          <LuFlipHorizontal className="h-4 w-4" />
        </Button>
        <Button
          variant={layer.flipY ? 'primary' : 'ghost'}
          onClick={() => onChange({ flipY: !layer.flipY })}
          className="flex-1 gap-1"
          aria-label={t('flipVertical')}
        >
          <LuFlipVertical className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
