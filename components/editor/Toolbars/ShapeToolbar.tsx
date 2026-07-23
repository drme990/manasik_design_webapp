'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import SliderField from '@/components/ui/SliderField';
import ColorPicker from '@/components/ui/ColorPicker';
import Switch from '@/components/ui/Switch';
import { cn } from '@/lib/utils/cn';
import { useTranslations } from '@/lib/i18n/strings';
import ShapeRenderer from '@/components/editor/ShapeRenderer';
import type { ShapeLayer } from '@/types';

export interface ShapeToolbarProps {
  layer: ShapeLayer;
  onChange: (updates: Partial<ShapeLayer>) => void;
  onSliderStart?: () => void;
  className?: string;
}

const SHAPES: ShapeLayer['shape'][] = [
  'rectangle',
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
  circle: 'circle',
  triangle: 'triangle',
  star_4: 'star4',
  star_5: 'star5',
  star_6: 'star6',
  star_8: 'star8',
  line: 'line',
  png: 'png',
};

export default function ShapeToolbar({ layer, onChange, onSliderStart, className }: ShapeToolbarProps) {
  const t = useTranslations('editor.toolbars.shape');
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
              fillColor="currentColor"
              strokeColor="currentColor"
              strokeWidth={2}
              filled={layer.filled ?? true}
              cornerRadius={0}
            />
          </Button>
        ))}
      </div>

      <Switch
        label={t('filled')}
        checked={layer.filled ?? true}
        onChange={(e) => onChange({ filled: e.target.checked })}
      />

      <ColorPicker
        label={t('fillColor')}
        value={layer.fillColor}
        onChange={(color) => onChange({ fillColor: color })}
        recent={recentColors}
        onRecentAdd={addRecentColor}
      />

      <ColorPicker
        label={t('strokeColor')}
        value={layer.strokeColor}
        onChange={(color) => onChange({ strokeColor: color })}
        recent={recentColors}
        onRecentAdd={addRecentColor}
      />

      <SliderField
        label={t('strokeWidth')}
        value={layer.strokeWidth}
        min={0}
        max={50}
        onChange={(v) => onChange({ strokeWidth: v })}
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

      {layer.shape === 'rectangle' && (
        <SliderField
          label={t('cornerRadius')}
          value={layer.cornerRadius ?? 0}
          min={0}
          max={200}
          onChange={(v) => onChange({ cornerRadius: v })}
        />
      )}
    </div>
  );
}
