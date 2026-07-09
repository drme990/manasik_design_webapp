'use client';

import { cn } from '@/lib/utils/cn';
import { useState, useRef, ReactNode } from 'react';
import { useClickOutside } from '@/lib/hooks/use-click-outside';

export interface DropdownItem {
  id: string;
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
  danger?: boolean;
  onClick?: () => void;
}

export interface DropdownProps {
  trigger: ReactNode;
  items: DropdownItem[];
  align?: 'left' | 'right';
  className?: string;
}

export default function Dropdown({ trigger, items, align = 'right', className }: DropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useClickOutside(dropdownRef, () => setIsOpen(false));

  const handleItemClick = (item: DropdownItem) => {
    if (!item.disabled) {
      item.onClick?.();
      setIsOpen(false);
    }
  };

  const alignClass = align === 'right' ? 'right-0' : 'left-0';

  return (
    <div ref={dropdownRef} className={cn('relative inline-block', className)}>
      <div onClick={() => setIsOpen(!isOpen)}>{trigger}</div>
      {isOpen && (
        <div
          className={cn(
            'absolute top-full mt-2 min-w-50 rounded-lg border border-stroke bg-card-bg shadow-lg z-50',
            alignClass
          )}
        >
          {items.map((item) => (
            <button
              key={item.id}
              onClick={() => handleItemClick(item)}
              disabled={item.disabled}
              className={cn(
                'flex w-full items-center gap-2 px-4 py-2.5 text-sm text-foreground transition-colors',
                'hover:bg-muted first:rounded-t-lg last:rounded-b-lg',
                item.disabled && 'opacity-50 cursor-not-allowed',
                item.danger && 'text-error hover:bg-error/10'
              )}
            >
              {item.icon && <span className="h-4 w-4">{item.icon}</span>}
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export { Dropdown };