'use client';

import { Button } from '@/components/ui/Button';
import NumberField from '@/components/ui/NumberField';
import SliderField from '@/components/ui/SliderField';
import { cn } from '@/lib/utils/cn';
import { useTranslations } from 'next-intl';
import type { ImageLayer } from '@/types';

export interface ImageToolbarProps {
  layer: ImageLayer;
  onChange: (updates: Partial<ImageLayer>) => void;
  className?: string;
}

export default function ImageToolbar({ layer, onChange, className }: ImageToolbarProps) {
  const t = useTranslations('editor.toolbars.image');

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
      />

      <SliderField
        label={t('opacity')}
        value={layer.opacity * 100}
        min={0}
        max={100}
        onChange={(v) => onChange({ opacity: v / 100 })}
        suffix="%"
      />

      <div className="grid grid-cols-2 gap-3">
        <NumberField
          label={t('offsetX')}
          value={layer.offsetX}
          onChange={(v) => onChange({ offsetX: v })}
        />
        <NumberField
          label={t('offsetY')}
          value={layer.offsetY}
          onChange={(v) => onChange({ offsetY: v })}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <SliderField
          label={t('borderRadius')}
          value={layer.borderRadius}
          min={0}
          max={200}
          onChange={(v) => onChange({ borderRadius: v })}
        />
        <SliderField
          label={t('borderWidth')}
          value={layer.borderWidth}
          min={0}
          max={50}
          onChange={(v) => onChange({ borderWidth: v })}
        />
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-foreground">{t('borderColor')}</label>
        <input
          type="color"
          value={layer.borderColor}
          onChange={(e) => onChange({ borderColor: e.target.value })}
          className="h-10 w-full cursor-pointer rounded-lg border border-stroke bg-background p-1"
        />
      </div>

      <div className="flex gap-2">
        <Button
          variant={layer.flipX ? 'primary' : 'ghost'}
          onClick={() => onChange({ flipX: !layer.flipX })}
          className="flex-1"
        >
          {t('flipHorizontal')}
        </Button>
        <Button
          variant={layer.flipY ? 'primary' : 'ghost'}
          onClick={() => onChange({ flipY: !layer.flipY })}
          className="flex-1"
        >
          {t('flipVertical')}
        </Button>
      </div>
    </div>
  );
}
