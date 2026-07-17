'use client';

import { Input } from '@/components/ui/Input';
import { Dropdown, DropdownItem } from '@/components/ui/Dropdown';
import NumberField from '@/components/ui/NumberField';
import SliderField from '@/components/ui/SliderField';
import ColorPicker from '@/components/ui/ColorPicker';
import { cn } from '@/lib/utils/cn';
import { useTranslations } from '@/lib/i18n/strings';
import { LuChevronDown, LuCheck } from 'react-icons/lu';
import type { DynamicFieldLayer } from '@/types';

export interface DynamicFieldToolbarProps {
  layer: DynamicFieldLayer;
  onChange: (updates: Partial<DynamicFieldLayer>) => void;
  className?: string;
}

const TRIGGER_BTN =
  'flex w-full items-center justify-between rounded-lg border border-stroke bg-background px-4 py-2.5 text-foreground transition-all duration-200 hover:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary';

export default function DynamicFieldToolbar({ layer, onChange, className }: DynamicFieldToolbarProps) {
  const t = useTranslations('editor.toolbars.dynamicField');

  const fieldTypeItems: DropdownItem[] = [
    { id: 'text', label: t('text'), onClick: () => onChange({ fieldType: 'text' }) },
    { id: 'image', label: t('image'), onClick: () => onChange({ fieldType: 'image' }) },
  ];

  const imageFitItems: DropdownItem[] = [
    { id: 'cover', label: t('cover'), onClick: () => onChange({ imageFit: 'cover' }) },
    { id: 'contain', label: t('contain'), onClick: () => onChange({ imageFit: 'contain' }) },
  ];

  const renderItem = (item: DropdownItem, isSelected: boolean) => (
    <span className="flex w-full items-center justify-between">
      <span>{item.label}</span>
      {isSelected && <LuCheck className="ms-2 h-4 w-4 shrink-0 text-brand-primary" />}
    </span>
  );

  const selectedFieldType = layer.fieldType;
  const selectedImageFit = layer.imageFit;

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

      {/* Field type dropdown */}
      <div className="w-full">
        <label className="mb-1.5 block text-sm font-medium text-foreground">{t('fieldType')}</label>
        <Dropdown
          align="left"
          className="w-full"
          trigger={
            <button type="button" className={TRIGGER_BTN}>
              <span className="truncate text-start">
                {selectedFieldType === 'text' ? t('text') : t('image')}
              </span>
              <LuChevronDown className="ms-2 h-5 w-5 shrink-0 text-secondary" />
            </button>
          }
          items={fieldTypeItems.map((item) => ({
            ...item,
            label: undefined as unknown as string,
            icon: renderItem(item, item.id === selectedFieldType),
          }))}
        />
      </div>

      {layer.fieldType === 'text' && (
        <>
          <NumberField
            label={t('fontSize')}
            value={layer.fontSize}
            min={1}
            max={200}
            onChange={(v) => onChange({ fontSize: v })}
          />
          <ColorPicker
            label={t('textColor')}
            value={layer.color}
            onChange={(color) => onChange({ color })}
          />
          {layer.backgroundColor !== undefined && (
            <ColorPicker
              label={t('backgroundColor')}
              value={layer.backgroundColor}
              onChange={(color) => onChange({ backgroundColor: color })}
            />
          )}
        </>
      )}

      {layer.fieldType === 'image' && (
        <>
          {/* Image fit dropdown */}
          <div className="w-full">
            <label className="mb-1.5 block text-sm font-medium text-foreground">{t('imageFit')}</label>
            <Dropdown
              align="left"
              className="w-full"
              trigger={
                <button type="button" className={TRIGGER_BTN}>
                  <span className="truncate text-start">
                    {selectedImageFit === 'cover' ? t('cover') : t('contain')}
                  </span>
                  <LuChevronDown className="ms-2 h-5 w-5 shrink-0 text-secondary" />
                </button>
              }
              items={imageFitItems.map((item) => ({
                ...item,
                label: undefined as unknown as string,
                icon: renderItem(item, item.id === selectedImageFit),
              }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <NumberField
              label={t('width')}
              value={layer.imageWidth || 200}
              min={10}
              max={2000}
              onChange={(v) => onChange({ imageWidth: v })}
            />
            <NumberField
              label={t('height')}
              value={layer.imageHeight || 200}
              min={10}
              max={2000}
              onChange={(v) => onChange({ imageHeight: v })}
            />
          </div>
        </>
      )}

      <SliderField
        label={t('strokeWidth')}
        value={layer.borderWidth ?? 0}
        min={0}
        max={50}
        onChange={(v) => onChange({ borderWidth: v })}
      />

      <SliderField
        label={t('opacity')}
        value={layer.opacity * 100}
        min={0}
        max={100}
        onChange={(v) => onChange({ opacity: v / 100 })}
        suffix="%"
      />

      <ColorPicker
        label={t('strokeColor')}
        value={layer.borderColor ?? '#cccccc'}
        onChange={(color) => onChange({ borderColor: color })}
      />
    </div>
  );
}
