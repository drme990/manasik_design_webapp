'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils/cn';

export interface SliderFieldProps {
  label?: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
  onDragStart?: () => void;
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
  onDragStart,
  className,
  suffix,
}: SliderFieldProps) {
  const [inputValue, setInputValue] = useState(String(value));
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    setInputValue(String(value));
  }

  const handleRangeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = Number(e.target.value);
    setInputValue(String(newValue));
    onChange(newValue);
  };

  const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
  };

  const commitNumber = () => {
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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      commitNumber();
      (e.currentTarget as HTMLInputElement).blur();
    }
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
          onMouseDown={onDragStart}
          onTouchStart={onDragStart}
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
            onBlur={commitNumber}
            onKeyDown={handleKeyDown}
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
