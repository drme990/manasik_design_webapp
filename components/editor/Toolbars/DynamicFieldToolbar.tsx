'use client';

import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { cn } from '@/lib/utils/cn';
import { useTranslations } from 'next-intl';
import type { DynamicFieldLayer } from '@/types';

export interface DynamicFieldToolbarProps {
  layer: DynamicFieldLayer;
  onChange: (updates: Partial<DynamicFieldLayer>) => void;
  className?: string;
}

export default function DynamicFieldToolbar({ layer, onChange, className }: DynamicFieldToolbarProps) {
  const t = useTranslations('editor.toolbars.dynamicField');

  const fieldTypeOptions = [
    { value: 'text', label: t('text') },
    { value: 'image', label: t('image') },
  ];

  const imageFitOptions = [
    { value: 'cover', label: t('cover') },
    { value: 'contain', label: t('contain') },
  ];

  return (
    <div className={cn('space-y-4 rounded-lg border border-stroke bg-card-bg p-4', className)}>
      <h3 className="text-sm font-semibold text-foreground">{t('title')}</h3>

      <Input
        label={t('variableName')}
        value={layer.variableName}
        onChange={(e) => onChange({ variableName: e.target.value })}
      />

      <Input
        label={t('placeholder')}
        value={layer.placeholder}
        onChange={(e) => onChange({ placeholder: e.target.value })}
      />

      <Select
        label={t('fieldType')}
        value={layer.fieldType}
        options={fieldTypeOptions}
        onChange={(e) => onChange({ fieldType: e.target.value as 'text' | 'image' })}
      />

      {layer.fieldType === 'text' && (
        <>
          <Input
            label={t('fontSize')}
            type="number"
            value={layer.fontSize}
            onChange={(e) => onChange({ fontSize: Number(e.target.value) })}
          />
          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">{t('textColor')}</label>
            <input
              type="color"
              value={layer.color}
              onChange={(e) => onChange({ color: e.target.value })}
              className="h-10 w-full cursor-pointer rounded-lg border border-stroke bg-background p-1"
            />
          </div>
          {layer.backgroundColor !== undefined && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">{t('backgroundColor')}</label>
              <input
                type="color"
                value={layer.backgroundColor}
                onChange={(e) => onChange({ backgroundColor: e.target.value })}
                className="h-10 w-full cursor-pointer rounded-lg border border-stroke bg-background p-1"
              />
            </div>
          )}
        </>
      )}

      {layer.fieldType === 'image' && (
        <>
          <Select
            label={t('imageFit')}
            value={layer.imageFit}
            options={imageFitOptions}
            onChange={(e) => onChange({ imageFit: e.target.value as 'cover' | 'contain' })}
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label={t('width')}
              type="number"
              value={layer.imageWidth || 200}
              onChange={(e) => onChange({ imageWidth: Number(e.target.value) })}
            />
            <Input
              label={t('height')}
              type="number"
              value={layer.imageHeight || 200}
              onChange={(e) => onChange({ imageHeight: Number(e.target.value) })}
            />
          </div>
        </>
      )}

      <Input
        label={t('strokeWidth')}
        type="number"
        value={layer.borderWidth}
        onChange={(e) => onChange({ borderWidth: Number(e.target.value) })}
      />

      <div>
        <label className="mb-1.5 block text-sm font-medium text-foreground">{t('strokeColor')}</label>
        <input
          type="color"
          value={layer.borderColor}
          onChange={(e) => onChange({ borderColor: e.target.value })}
          className="h-10 w-full cursor-pointer rounded-lg border border-stroke bg-background p-1"
        />
      </div>
    </div>
  );
}
