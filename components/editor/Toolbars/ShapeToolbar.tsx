'use client';

import { Button } from '@/components/ui/Button';
import NumberField from '@/components/ui/NumberField';
import SliderField from '@/components/ui/SliderField';
import { cn } from '@/lib/utils/cn';
import { useTranslations } from 'next-intl';
import ShapeRenderer from '@/components/editor/ShapeRenderer';
import type { ShapeLayer } from '@/types';

export interface ShapeToolbarProps {
  layer: ShapeLayer;
  onChange: (updates: Partial<ShapeLayer>) => void;
  className?: string;
}

const SHAPES: ShapeLayer['shape'][] = [
  'rectangle',
  'rectangle_free',
  'circle',
  'triangle',
  'star_4',
  'star_5',
  'star_6',
  'star_8',
  'line',
];

const SHAPE_LABEL_KEYS: Record<ShapeLayer['shape'], string> = {
  rectangle: 'rectangle',
  rectangle_free: 'rectangleFree',
  circle: 'circle',
  triangle: 'triangle',
  star_4: 'star4',
  star_5: 'star5',
  star_6: 'star6',
  star_8: 'star8',
  line: 'line',
};

export default function ShapeToolbar({ layer, onChange, className }: ShapeToolbarProps) {
  const t = useTranslations('editor.toolbars.shape');

  return (
    <div className={cn('space-y-4 rounded-lg border border-stroke bg-card-bg p-4', className)}>
      <h3 className="text-sm font-semibold text-foreground">{t('title')}</h3>

      <div className="grid grid-cols-3 gap-2">
        {SHAPES.map((shape) => (
          <Button
            key={shape}
            variant={layer.shape === shape ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => onChange({ shape })}
            className="flex h-12 items-center justify-center p-1"
            aria-label={t(SHAPE_LABEL_KEYS[shape])}
          >
            <ShapeRenderer
              shape={shape}
              width={28}
              height={28}
              fillColor={layer.shape === shape ? 'currentColor' : layer.fillColor}
              strokeColor={layer.shape === shape ? 'currentColor' : layer.strokeColor}
              strokeWidth={2}
              cornerRadius={shape === 'rectangle_free' ? 6 : 0}
            />
          </Button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-foreground">{t('fillColor')}</label>
          <input
            type="color"
            value={layer.fillColor}
            onChange={(e) => onChange({ fillColor: e.target.value })}
            className="h-10 w-full cursor-pointer rounded-lg border border-stroke bg-background p-1"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-foreground">{t('strokeColor')}</label>
          <input
            type="color"
            value={layer.strokeColor}
            onChange={(e) => onChange({ strokeColor: e.target.value })}
            className="h-10 w-full cursor-pointer rounded-lg border border-stroke bg-background p-1"
          />
        </div>
      </div>

      <SliderField
        label={t('strokeWidth')}
        value={layer.strokeWidth}
        min={0}
        max={50}
        onChange={(v) => onChange({ strokeWidth: v })}
      />

      <SliderField
        label={t('opacity')}
        value={layer.opacity * 100}
        min={0}
        max={100}
        onChange={(v) => onChange({ opacity: v / 100 })}
        suffix="%"
      />

      {layer.shape === 'rectangle_free' && (
        <SliderField
          label={t('cornerRadius')}
          value={layer.cornerRadius || 20}
          min={0}
          max={200}
          onChange={(v) => onChange({ cornerRadius: v })}
        />
      )}
    </div>
  );
}
