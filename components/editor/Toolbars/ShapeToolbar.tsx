'use client';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { cn } from '@/lib/utils/cn';
import { useTranslations } from 'next-intl';
import type { ShapeLayer } from '@/types';

export interface ShapeToolbarProps {
  layer: ShapeLayer;
  onChange: (updates: Partial<ShapeLayer>) => void;
  className?: string;
}

export default function ShapeToolbar({ layer, onChange, className }: ShapeToolbarProps) {
  const t = useTranslations('editor.toolbars.shape');

  const shapeOptions = [
    { value: 'rectangle', label: t('rectangle') },
    { value: 'rectangle_free', label: t('rectangleFree') },
    { value: 'circle', label: t('circle') },
    { value: 'triangle', label: t('triangle') },
    { value: 'star_4', label: t('star4') },
    { value: 'star_5', label: t('star5') },
    { value: 'star_6', label: t('star6') },
    { value: 'star_8', label: t('star8') },
    { value: 'line', label: t('line') },
  ];

  return (
    <div className={cn('space-y-4 rounded-lg border border-stroke bg-card-bg p-4', className)}>
      <h3 className="text-sm font-semibold text-foreground">{t('title')}</h3>

      <div className="grid grid-cols-3 gap-2">
        {shapeOptions.map((shape) => (
          <Button
            key={shape.value}
            variant={layer.shape === shape.value ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => onChange({ shape: shape.value as ShapeLayer['shape'] })}
          >
            {shape.label}
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

      <Input
        label={t('strokeWidth')}
        type="number"
        value={layer.strokeWidth}
        onChange={(e) => onChange({ strokeWidth: Number(e.target.value) })}
      />

      {layer.shape === 'rectangle_free' && (
        <Input
          label={t('cornerRadius')}
          type="number"
          value={layer.cornerRadius || 20}
          onChange={(e) => onChange({ cornerRadius: Number(e.target.value) })}
        />
      )}
    </div>
  );
}
