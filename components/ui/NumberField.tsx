'use client';

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils/cn';

export interface NumberFieldProps {
  label?: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
  className?: string;
  suffix?: string;
}

export default function NumberField({
  label,
  value,
  min = -Infinity,
  max = Infinity,
  step = 1,
  onChange,
  className,
  suffix,
}: NumberFieldProps) {
  const [inputValue, setInputValue] = useState(String(value));

  useEffect(() => {
    setInputValue(String(value));
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setInputValue(raw);
    if (raw === '') return;
    const num = Number(raw);
    if (!Number.isNaN(num)) {
      onChange(Math.max(min, Math.min(max, num)));
    }
  };

  const handleBlur = () => {
    if (inputValue === '') {
      setInputValue('0');
      onChange(0);
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
      <div className="relative flex items-center">
        <input
          type="text"
          inputMode="decimal"
          value={inputValue}
          step={step}
          onChange={handleChange}
          onBlur={handleBlur}
          className={cn(
            'w-full rounded-lg border border-stroke bg-background px-4 py-2.5 text-foreground',
            'focus:outline-none focus:ring-2 focus:ring-brand-primary focus:border-brand-primary',
            'transition-all duration-200',
            suffix && 'pe-10'
          )}
        />
        {suffix && (
          <span className="absolute inset-e-3 text-xs text-secondary">{suffix}</span>
        )}
      </div>
    </div>
  );
}
