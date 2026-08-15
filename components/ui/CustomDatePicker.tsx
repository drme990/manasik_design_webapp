'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  LuCalendarDays as CalendarDays,
  LuChevronLeft as ChevronLeft,
  LuChevronRight as ChevronRight,
} from 'react-icons/lu';
import { cn } from '@/lib/utils/cn';

interface CustomDatePickerProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  helperText?: string;
  disabledDates?: string[];
  markedDates?: string[];
  minDate?: string;
  maxDate?: string;
  className?: string;
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function fromIsoDate(value: string): Date | null {
  if (!isIsoDate(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(year, month - 1, day);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDisplayDate(value: string): string {
  const date = fromIsoDate(value);
  if (!date) return '';
  return date.toLocaleDateString('ar-EG', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function buildWeekdays(): string[] {
  const formatter = new Intl.DateTimeFormat('ar-EG', { weekday: 'short' });
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(2024, 0, 7 + index);
    return formatter.format(date);
  });
}

export default function CustomDatePicker({
  value,
  onChange,
  label,
  placeholder,
  helperText,
  disabledDates = [],
  markedDates = [],
  minDate,
  maxDate,
  className,
}: CustomDatePickerProps) {
  const selectedDate = useMemo(() => fromIsoDate(value), [value]);
  const [isOpen, setIsOpen] = useState(false);
  const [monthDate, setMonthDate] = useState<Date>(selectedDate ?? new Date());
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const weekdays = useMemo(() => buildWeekdays(), []);

  const disabledSet = useMemo(
    () => new Set(disabledDates.filter(isIsoDate)),
    [disabledDates],
  );
  const markedSet = useMemo(
    () => new Set(markedDates.filter(isIsoDate)),
    [markedDates],
  );

  const minIso = minDate && isIsoDate(minDate) ? minDate : null;
  const maxIso = maxDate && isIsoDate(maxDate) ? maxDate : null;

  const monthLabel = monthDate.toLocaleDateString('ar-EG', {
    year: 'numeric',
    month: 'long',
  });

  const calendarDays = useMemo(() => {
    const firstDay = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
    const daysInMonth = new Date(
      monthDate.getFullYear(),
      monthDate.getMonth() + 1,
      0,
    ).getDate();
    const leadingDays = firstDay.getDay();
    const cells: Array<{ date: Date; inCurrentMonth: boolean }> = [];

    for (let index = 0; index < leadingDays; index += 1) {
      cells.push({
        date: new Date(
          monthDate.getFullYear(),
          monthDate.getMonth(),
          index - leadingDays + 1,
        ),
        inCurrentMonth: false,
      });
    }

    for (let day = 1; day <= daysInMonth; day += 1) {
      cells.push({
        date: new Date(monthDate.getFullYear(), monthDate.getMonth(), day),
        inCurrentMonth: true,
      });
    }

    while (cells.length % 7 !== 0) {
      const overflowDay = cells.length - (leadingDays + daysInMonth) + 1;
      cells.push({
        date: new Date(
          monthDate.getFullYear(),
          monthDate.getMonth() + 1,
          overflowDay,
        ),
        inCurrentMonth: false,
      });
    }

    return cells;
  }, [monthDate]);

  return (
    <div className={cn('space-y-2', className)} ref={rootRef}>
      {label && (
        <label className="block text-sm font-medium text-foreground">
          {label}
        </label>
      )}

      <div className="relative">
        <button
          type="button"
          onClick={() => {
            setIsOpen((prev) => {
              const next = !prev;
              if (next && selectedDate) {
                setMonthDate(selectedDate);
              }
              return next;
            });
          }}
          className="flex w-full items-center justify-between gap-3 rounded-lg border border-stroke bg-background px-4 py-3 text-start text-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
          aria-label={label || placeholder || 'Select date'}
        >
          <span className={cn(!value && 'text-secondary')}>
            {value ? formatDisplayDate(value) : placeholder}
          </span>
          <CalendarDays size={18} className="shrink-0 text-secondary" />
        </button>

        {isOpen && (
          <div className="absolute z-30 mt-2 w-full min-w-[18rem] rounded-site border border-stroke bg-card-bg p-4 shadow-xl">
            <div className="mb-4 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() =>
                  setMonthDate(
                    new Date(
                      monthDate.getFullYear(),
                      monthDate.getMonth() - 1,
                      1,
                    ),
                  )
                }
                className="flex h-9 w-9 items-center justify-center rounded-full border border-stroke text-secondary transition-colors hover:border-brand-primary hover:text-foreground"
              >
                <ChevronLeft size={16} className="rotate-180" />
              </button>

              <div className="text-sm font-semibold text-foreground">
                {monthLabel}
              </div>

              <button
                type="button"
                onClick={() =>
                  setMonthDate(
                    new Date(
                      monthDate.getFullYear(),
                      monthDate.getMonth() + 1,
                      1,
                    ),
                  )
                }
                className="flex h-9 w-9 items-center justify-center rounded-full border border-stroke text-secondary transition-colors hover:border-brand-primary hover:text-foreground"
              >
                <ChevronRight size={16} className="rotate-180" />
              </button>
            </div>

            <div className="mb-2 grid grid-cols-7 gap-1">
              {weekdays.map((day) => (
                <div
                  key={day}
                  className="py-1 text-center text-[11px] font-medium text-secondary"
                >
                  {day}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {calendarDays.map(({ date, inCurrentMonth }) => {
                const iso = toIsoDate(date);
                const isSelected = value === iso;
                const isDisabled =
                  disabledSet.has(iso) ||
                  (minIso !== null && iso < minIso) ||
                  (maxIso !== null && iso > maxIso);
                const isMarked = markedSet.has(iso);

                return (
                  <button
                    key={iso}
                    type="button"
                    disabled={isDisabled}
                    onClick={() => {
                      onChange(iso);
                      setIsOpen(false);
                    }}
                    className={cn(
                      'h-10 rounded-lg text-sm transition-colors',
                      isDisabled &&
                      'cursor-not-allowed bg-background text-secondary/40',
                      !isDisabled &&
                      !isSelected &&
                      !isMarked &&
                      inCurrentMonth &&
                      'text-foreground hover:bg-brand-primary/10',
                      !isDisabled &&
                      !isSelected &&
                      !isMarked &&
                      !inCurrentMonth &&
                      'text-secondary/40 hover:bg-brand-primary/5',
                      isMarked &&
                      !isSelected &&
                      'bg-warning/10 text-warning ring-1 ring-warning/30 hover:bg-warning/15',
                      isSelected && 'bg-brand-primary text-white shadow-sm',
                    )}
                  >
                    {date.getDate()}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {helperText && <p className="text-sm text-secondary">{helperText}</p>}
    </div>
  );
}
