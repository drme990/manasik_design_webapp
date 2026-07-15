'use client';

import { cn } from '@/lib/utils/cn';
import { ASPECT_RATIOS } from '@/lib/constants/presets';
import { useTranslations } from '@/lib/i18n/strings';

export interface AspectRatioPickerProps {
  value?: { width: number; height: number };
  onChange: (width: number, height: number) => void;
  className?: string;
}

export default function AspectRatioPicker({ value, onChange, className }: AspectRatioPickerProps) {
  const t = useTranslations('common.aspectRatio');

  return (
    <div className={cn('w-full', className)}>
      <label className="mb-2 block text-sm font-medium text-foreground">
        {t('title')}
      </label>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {ASPECT_RATIOS.map((ratio) => {
          const isSelected = value?.width === ratio.width && value?.height === ratio.height;
          return (
            <button
              key={ratio.label}
              onClick={() => onChange(ratio.width, ratio.height)}
              className={cn(
                'flex flex-col items-center gap-2 rounded-lg border p-3 transition-colors',
                isSelected
                  ? 'border-brand-primary bg-brand-primary-light/10'
                  : 'border-stroke bg-card-bg hover:border-brand-primary/50'
              )}
            >
              <div
                className="rounded bg-muted"
                style={{
                  width: ratio.ratio >= 1 ? '32px' : `${32 * ratio.ratio}px`,
                  height: ratio.ratio >= 1 ? `${32 / ratio.ratio}px` : '32px',
                }}
              />
              <span className={cn(
                'text-xs font-medium',
                isSelected ? 'text-brand-primary' : 'text-foreground'
              )}>
                {ratio.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}