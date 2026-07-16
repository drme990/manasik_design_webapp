'use client';

import { useState, useRef, useEffect } from 'react';
import { LuPipette, LuX } from 'react-icons/lu';
import { cn } from '@/lib/utils/cn';

export interface ColorPickerProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  recent?: string[];
  onRecentAdd?: (color: string) => void;
  placement?: 'left' | 'right';
  dropUp?: boolean;
  className?: string;
}

const PRESETS = [
  '#000000', '#ffffff', '#ef4444', '#f97316', '#f59e0b',
  '#84cc16', '#10b981', '#06b6d4', '#0ea5e9', '#3b82f6',
  '#6366f1', '#8b5cf6', '#d946ef', '#f43f5e', '#78716c',
];

export default function ColorPicker({
  value,
  onChange,
  label,
  recent = [],
  onRecentAdd,
  placement = 'right',
  dropUp = false,
  className,
}: ColorPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [localValue, setLocalValue] = useState(value);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (color: string) => {
    onChange(color);
    onRecentAdd?.(color);
    setIsOpen(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const color = e.target.value;
    setLocalValue(color);
    onChange(color);
  };

  const handleInputBlur = () => {
    onRecentAdd?.(localValue);
  };

  const openNativePicker = () => {
    inputRef.current?.click();
  };

  return (
    <div ref={containerRef} className={cn('relative w-full', className)}>
      {label && (
        <label className="mb-1.5 block text-sm font-medium text-foreground">{label}</label>
      )}

      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'flex w-full items-center gap-2 rounded-lg border border-stroke bg-background px-3 py-2',
          'transition-colors hover:bg-muted focus:outline-none focus:ring-2 focus:ring-brand-primary'
        )}
      >
        <span
          className="h-6 w-6 shrink-0 rounded-md border border-stroke shadow-sm"
          style={{ backgroundColor: value }}
        />
        <span className="flex-1 text-left text-sm font-medium text-foreground uppercase">
          {value}
        </span>
        <LuPipette className="h-4 w-4 text-secondary" />
      </button>

      {isOpen && (
        <div className={cn(
          'absolute z-30 w-64 rounded-xl border border-stroke bg-card-bg p-3 shadow-lg',
          dropUp ? 'bottom-full mb-1' : 'top-full mt-1',
          placement === 'left' ? 'left-0' : 'right-0'
        )}>
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-medium text-foreground">Pick color</span>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="rounded-md p-1 text-secondary hover:bg-muted hover:text-foreground"
            >
              <LuX className="h-4 w-4" />
            </button>
          </div>

          <div className="mb-3 grid grid-cols-5 gap-2">
            {PRESETS.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => handleSelect(color)}
                className={cn(
                  'h-8 w-full rounded-md border border-stroke transition-transform hover:scale-110',
                  value.toLowerCase() === color.toLowerCase() && 'ring-2 ring-brand-primary ring-offset-1'
                )}
                style={{ backgroundColor: color }}
                aria-label={color}
              />
            ))}
          </div>

          {recent.length > 0 && (
            <div className="mb-3">
              <span className="mb-1.5 block text-xs font-medium text-secondary">Recent</span>
              <div className="flex flex-wrap gap-2">
                {recent.map((color, index) => (
                  <button
                    key={`${color}-${index}`}
                    type="button"
                    onClick={() => handleSelect(color)}
                    className={cn(
                      'h-6 w-6 rounded-full border border-stroke transition-transform hover:scale-110',
                      value.toLowerCase() === color.toLowerCase() && 'ring-2 ring-brand-primary ring-offset-1'
                    )}
                    style={{ backgroundColor: color }}
                    aria-label={color}
                  />
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <input
                ref={inputRef}
                type="color"
                value={localValue}
                onChange={handleInputChange}
                onBlur={handleInputBlur}
                className="sr-only"
              />
              <button
                type="button"
                onClick={openNativePicker}
                className={cn(
                  'flex w-full items-center gap-2 rounded-lg border border-stroke bg-background px-3 py-2',
                  'text-sm text-foreground transition-colors hover:bg-muted'
                )}
              >
                <span
                  className="h-5 w-5 shrink-0 rounded border border-stroke"
                  style={{ backgroundColor: localValue }}
                />
                Custom
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
