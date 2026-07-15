'use client';

import { useState, useMemo } from 'react';
import { cn } from '@/lib/utils/cn';
import { rgbToHex, hsvToRgb, rgbToHsv, hexToRgb } from '@/lib/utils/color';
import { COLOR_PALETTE } from '@/lib/constants/brand-colors';
import { useTranslations } from '@/lib/i18n/strings';
import { LuPipette } from 'react-icons/lu';

export interface ColorPickerProps {
  color: string;
  onChange: (color: string) => void;
  label?: string;
  showEyedropper?: boolean;
  onEyedropper?: () => void;
  className?: string;
}

export default function ColorPicker({
  color,
  onChange,
  label,
  showEyedropper = true,
  onEyedropper,
  className,
}: ColorPickerProps) {
  const t = useTranslations('editor.colorPicker');
  const [hsv, setHsv] = useState(() => {
    const rgb = hexToRgb(color) || { r: 0, g: 0, b: 0 };
    return rgbToHsv(rgb.r, rgb.g, rgb.b);
  });

  const currentHex = useMemo(() => {
    const rgb = hsvToRgb(hsv.h, hsv.s, hsv.v);
    return rgbToHex(rgb.r, rgb.g, rgb.b);
  }, [hsv]);

  const handleHueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newHsv = { ...hsv, h: Number(e.target.value) / 360 };
    setHsv(newHsv);
    const rgb = hsvToRgb(newHsv.h, newHsv.s, newHsv.v);
    onChange(rgbToHex(rgb.r, rgb.g, rgb.b));
  };

  const handleSaturationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newHsv = { ...hsv, s: Number(e.target.value) / 100 };
    setHsv(newHsv);
    const rgb = hsvToRgb(newHsv.h, newHsv.s, newHsv.v);
    onChange(rgbToHex(rgb.r, rgb.g, rgb.b));
  };

  const handleValueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newHsv = { ...hsv, v: Number(e.target.value) / 100 };
    setHsv(newHsv);
    const rgb = hsvToRgb(newHsv.h, newHsv.s, newHsv.v);
    onChange(rgbToHex(rgb.r, rgb.g, rgb.b));
  };

  const handleHexChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const hex = e.target.value;
    if (/^#[0-9A-Fa-f]{6}$/.test(hex)) {
      const rgb = hexToRgb(hex) || { r: 0, g: 0, b: 0 };
      setHsv(rgbToHsv(rgb.r, rgb.g, rgb.b));
      onChange(hex);
    }
  };

  return (
    <div className={cn('w-full', className)}>
      {label && (
        <label className="mb-2 block text-sm font-medium text-foreground">
          {label}
        </label>
      )}

      <div className="rounded-xl border border-stroke bg-card-bg p-4 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <div
            className="h-12 w-12 rounded-lg border border-stroke shadow-inner"
            style={{ backgroundColor: currentHex }}
          />
          <div className="flex-1">
            <input
              type="text"
              value={currentHex}
              onChange={handleHexChange}
              className="w-full rounded-lg border border-stroke bg-background px-3 py-2 text-sm font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-brand-primary"
            />
          </div>
          {showEyedropper && onEyedropper && (
            <button
              onClick={onEyedropper}
              className="p-2 rounded-lg text-foreground hover:bg-muted"
              aria-label={t('pickColor')}
            >
              <LuPipette className="h-5 w-5" />
            </button>
          )}
        </div>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs text-secondary">{t('hue')}</label>
            <input
              type="range"
              min="0"
              max="360"
              value={hsv.h * 360}
              onChange={handleHueChange}
              className="w-full h-3 rounded-lg appearance-none cursor-pointer focus:outline-none"
              style={{
                background: 'linear-gradient(to right, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)',
              }}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-secondary">{t('saturation')}</label>
            <input
              type="range"
              min="0"
              max="100"
              value={hsv.s * 100}
              onChange={handleSaturationChange}
              className="w-full h-3 rounded-lg appearance-none cursor-pointer bg-stroke accent-brand-primary focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-secondary">{t('value')}</label>
            <input
              type="range"
              min="0"
              max="100"
              value={hsv.v * 100}
              onChange={handleValueChange}
              className="w-full h-3 rounded-lg appearance-none cursor-pointer bg-stroke accent-brand-primary focus:outline-none"
            />
          </div>
        </div>

        <div className="mt-4 grid grid-cols-7 gap-2">
          {COLOR_PALETTE.map((paletteColor) => (
            <button
              key={paletteColor}
              onClick={() => {
                const rgb = hexToRgb(paletteColor) || { r: 0, g: 0, b: 0 };
                setHsv(rgbToHsv(rgb.r, rgb.g, rgb.b));
                onChange(paletteColor);
              }}
              className={cn(
                'h-7 w-7 rounded-full border-2 transition-transform hover:scale-110',
                currentHex === paletteColor ? 'border-foreground' : 'border-transparent'
              )}
              style={{ backgroundColor: paletteColor }}
              aria-label={`Select color ${paletteColor}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}