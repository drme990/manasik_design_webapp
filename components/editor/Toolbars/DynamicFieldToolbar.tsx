'use client';

import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Dropdown, DropdownItem } from '@/components/ui/Dropdown';
import SliderField from '@/components/ui/SliderField';
import ColorPicker from '@/components/ui/ColorPicker';
import { cn } from '@/lib/utils/cn';
import { ARABIC_SAFE_FONTS } from '@/lib/constants/arabic-fonts';
import { resolveFontFamily } from '@/lib/constants/fonts';
import { useTranslations } from '@/lib/i18n/strings';
import { LuChevronDown, LuCheck } from 'react-icons/lu';
import { COLLAGE_LAYOUTS } from '@/lib/constants/presets';
import type { DynamicFieldLayer } from '@/types';

export interface DynamicFieldToolbarProps {
  layer: DynamicFieldLayer;
  onChange: (updates: Partial<DynamicFieldLayer>) => void;
  onSliderStart?: () => void;
  className?: string;
}

const TRIGGER_BTN =
  'flex w-full items-center justify-between rounded-lg border border-stroke bg-background px-4 py-2.5 text-foreground transition-all duration-200 hover:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary';

export default function DynamicFieldToolbar({ layer, onChange, onSliderStart, className }: DynamicFieldToolbarProps) {
  const t = useTranslations('editor.toolbars.dynamicField');
  const tText = useTranslations('editor.toolbars.text');

  const fieldTypeItems: DropdownItem[] = [
    { id: 'text', label: t('text'), onClick: () => onChange({ fieldType: 'text' }) },
    { id: 'image', label: t('image'), onClick: () => onChange({ fieldType: 'image' }) },
  ];

  const imageFitItems: DropdownItem[] = [
    { id: 'cover', label: t('cover'), onClick: () => onChange({ imageFit: 'cover' }) },
    { id: 'contain', label: t('contain'), onClick: () => onChange({ imageFit: 'contain' }) },
  ];

  const fontItems: DropdownItem[] = ARABIC_SAFE_FONTS.map((font) => ({
    id: font.id,
    label: font.name,
    onClick: () => onChange({ fontFamily: font.family, fontWeight: font.weight }),
  }));

  const alignItems: DropdownItem[] = [
    { id: 'left', label: tText('left'), onClick: () => onChange({ align: 'left' }) },
    { id: 'center', label: tText('center'), onClick: () => onChange({ align: 'center' }) },
    { id: 'right', label: tText('right'), onClick: () => onChange({ align: 'right' }) },
  ];

  const vAlignItems: DropdownItem[] = [
    { id: 'top', label: tText('top'), onClick: () => onChange({ verticalAlign: 'top' }) },
    { id: 'middle', label: tText('middle'), onClick: () => onChange({ verticalAlign: 'middle' }) },
    { id: 'bottom', label: tText('bottom'), onClick: () => onChange({ verticalAlign: 'bottom' }) },
  ];

  const renderItem = (item: DropdownItem, isSelected: boolean) => (
    <span className="flex w-full items-center justify-between">
      <span>{item.label}</span>
      {isSelected && <LuCheck className="ms-2 h-4 w-4 shrink-0 text-brand-primary" />}
    </span>
  );

  const renderFontItem = (item: DropdownItem, isSelected: boolean) => {
    const font = ARABIC_SAFE_FONTS.find((f) => f.id === item.id);
    return (
      <span className="flex w-full items-center justify-between">
        <span
          className="truncate"
          style={font ? { fontFamily: resolveFontFamily(font.family), fontWeight: font.weight } : undefined}
        >
          {item.label}
        </span>
        {isSelected && <LuCheck className="ms-2 h-4 w-4 shrink-0 text-brand-primary" />}
      </span>
    );
  };

  const selectedFieldType = layer.fieldType;
  const selectedImageFit = layer.imageFit;
  const selectedFont = ARABIC_SAFE_FONTS.find((f) => f.family === layer.fontFamily && f.weight === (layer.fontWeight || 400));
  const selectedAlign = layer.align || 'center';
  const selectedVAlign = layer.verticalAlign || 'middle';

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
          {/* Font dropdown */}
          <div className="w-full">
            <label className="mb-1.5 block text-sm font-medium text-foreground">{tText('font')}</label>
            <Dropdown
              align="left"
              className="w-full"
              trigger={
                <button type="button" className={TRIGGER_BTN}>
                  <span
                    className="truncate text-start"
                    style={{ fontFamily: resolveFontFamily(layer.fontFamily || 'Expo Arabic'), fontWeight: layer.fontWeight || 400 }}
                  >
                    {selectedFont?.name || layer.fontFamily || 'Expo Arabic'}
                  </span>
                  <LuChevronDown className="ms-2 h-5 w-5 shrink-0 text-secondary" />
                </button>
              }
              items={fontItems.map((item) => {
                const font = ARABIC_SAFE_FONTS.find((f) => f.id === item.id);
                const isSelectedFont = font && font.family === (layer.fontFamily || 'Expo Arabic') && font.weight === (layer.fontWeight || 400);
                return {
                  ...item,
                  label: undefined as unknown as string,
                  icon: renderFontItem(item, !!isSelectedFont),
                };
              })}
            />
          </div>

          <SliderField
            label={tText('lineHeight')}
            value={layer.lineHeight ?? 1.2}
            min={0.5}
            max={2.5}
            step={0.1}
            onChange={(v) => onChange({ lineHeight: v })}
            onDragStart={onSliderStart}
          />

          <div className="grid grid-cols-2 gap-3">
            {/* Align dropdown */}
            <div className="w-full">
              <label className="mb-1.5 block text-sm font-medium text-foreground">{tText('align')}</label>
              <Dropdown
                align="left"
                className="w-full"
                trigger={
                  <button type="button" className={TRIGGER_BTN}>
                    <span className="truncate text-start">
                      {selectedAlign === 'left' ? tText('left') : selectedAlign === 'center' ? tText('center') : tText('right')}
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
              <label className="mb-1.5 block text-sm font-medium text-foreground">{tText('vAlign')}</label>
              <Dropdown
                align="left"
                className="w-full"
                trigger={
                  <button type="button" className={TRIGGER_BTN}>
                    <span className="truncate text-start">
                      {selectedVAlign === 'top' ? tText('top') : selectedVAlign === 'bottom' ? tText('bottom') : tText('middle')}
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

          {/* Bold + Italic buttons */}
          <div className="flex gap-2">
            <Button
              variant={(layer.bold ?? true) ? 'primary' : 'ghost'}
              onClick={() => onChange({ bold: !(layer.bold ?? true) })}
              className="flex-1"
            >
              {tText('bold')}
            </Button>
            <Button
              variant={(layer.italic ?? false) ? 'primary' : 'ghost'}
              onClick={() => onChange({ italic: !(layer.italic ?? false) })}
              className="flex-1"
            >
              {tText('italic')}
            </Button>
          </div>

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

          {/* Collage layout dropdown — for multi-photo fields */}
          <div className="w-full">
            <label className="mb-1.5 block text-sm font-medium text-foreground">{t('collageLayout')}</label>
            <Dropdown
              align="left"
              className="w-full"
              trigger={
                <button type="button" className={TRIGGER_BTN}>
                  <span className="truncate text-start">
                    {layer.collageLayout
                      ? COLLAGE_LAYOUTS.find((l) => l.id === layer.collageLayout)?.name ?? layer.collageLayout
                      : t('singleImage')}
                  </span>
                  <LuChevronDown className="ms-2 h-5 w-5 shrink-0 text-secondary" />
                </button>
              }
              items={[
                { id: 'single', label: t('singleImage'), onClick: () => onChange({ collageLayout: undefined }) },
                ...COLLAGE_LAYOUTS.map((l) => ({
                  id: l.id,
                  label: l.name,
                  onClick: () => onChange({ collageLayout: l.id }),
                })),
              ].map((item) => ({
                ...item,
                label: undefined as unknown as string,
                icon: renderItem(item, item.id === (layer.collageLayout ?? 'single')),
              }))}
            />
          </div>

          {/* Collage gap — only when a collage layout is selected */}
          {layer.collageLayout && (
            <SliderField
              label={t('collageGap')}
              value={layer.collageGap ?? 4}
              min={0}
              max={20}
              onChange={(v) => onChange({ collageGap: v })}
            />
          )}
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
