'use client';

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils/cn';

export interface SliderFieldProps {
  label?: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
  className?: string;
  suffix?: string;
}

export default function SliderField({
  label,
  value,
  min = 0,
  max = 100,
  step = 1,
  onChange,
  className,
  suffix,
}: SliderFieldProps) {
  const [inputValue, setInputValue] = useState(String(value));

  useEffect(() => {
    setInputValue(String(value));
  }, [value]);

  const handleRangeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = Number(e.target.value);
    setInputValue(String(newValue));
    onChange(newValue);
  };

  const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setInputValue(raw);
    if (raw === '') return;
    const num = Number(raw);
    if (!Number.isNaN(num)) {
      onChange(Math.max(min, Math.min(max, num)));
    }
  };

  const handleNumberBlur = () => {
    if (inputValue === '') {
      setInputValue(String(min));
      onChange(min);
      return;
    }
    const num = Number(inputValue);
    if (Number.isNaN(num)) {
      setInputValue(String(value));
      return;
    }
    const clamped = Math.max(min, Math.min(max, num));
    setInputValue(String(clamped));
    onChange(clamped);
  };

  return (
    <div className={cn('w-full space-y-2', className)}>
      {label && (
        <label className="block text-sm font-medium text-foreground">{label}</label>
      )}
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={handleRangeChange}
          className={cn(
            'h-2 w-full cursor-pointer appearance-none rounded-lg bg-muted accent-brand-primary',
            'focus:outline-none focus:ring-2 focus:ring-brand-primary'
          )}
        />
        <div className="relative flex w-20 shrink-0 items-center">
          <input
            type="text"
            inputMode="decimal"
            value={inputValue}
            onChange={handleNumberChange}
            onBlur={handleNumberBlur}
            className={cn(
              'w-full rounded-lg border border-stroke bg-background px-2 py-1.5 text-center text-sm text-foreground',
              'focus:outline-none focus:ring-2 focus:ring-brand-primary focus:border-brand-primary'
            )}
          />
          {suffix && (
            <span className="absolute inset-e-1 text-xs text-secondary">{suffix}</span>
          )}
        </div>
      </div>
    </div>
  );
}
