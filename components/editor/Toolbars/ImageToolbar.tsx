'use client';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Slider } from '@/components/ui/Slider';
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

      <div>
        <label className="mb-2 block text-sm font-medium text-foreground">{t('scale')}</label>
        <Slider
          min={0.1}
          max={3}
          step={0.05}
          value={layer.imageScale}
          onChange={(e) => onChange({ imageScale: Number(e.target.value) })}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Input
          label={t('offsetX')}
          type="number"
          value={layer.offsetX}
          onChange={(e) => onChange({ offsetX: Number(e.target.value) })}
        />
        <Input
          label={t('offsetY')}
          type="number"
          value={layer.offsetY}
          onChange={(e) => onChange({ offsetY: Number(e.target.value) })}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Input
          label={t('borderRadius')}
          type="number"
          value={layer.borderRadius}
          onChange={(e) => onChange({ borderRadius: Number(e.target.value) })}
        />
        <Input
          label={t('borderWidth')}
          type="number"
          value={layer.borderWidth}
          onChange={(e) => onChange({ borderWidth: Number(e.target.value) })}
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
