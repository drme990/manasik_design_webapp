'use client';

import { cn } from '@/lib/utils/cn';
import { useEffect } from 'react';

export interface ToastProps {
  message: string;
  variant?: 'success' | 'error' | 'warning' | 'info';
  duration?: number;
  onClose: () => void;
}

export default function Toast({ message, variant = 'info', duration = 3000, onClose }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [duration, onClose]);

  const variantStyles = {
    success: 'bg-success text-white',
    error: 'bg-error text-white',
    warning: 'bg-warning text-foreground',
    info: 'bg-info text-white',
  };

  return (
    <div
      className={cn(
        'fixed bottom-4 right-4 z-50 rounded-lg px-4 py-3 shadow-lg',
        'animate-in slide-in-from-bottom-2 fade-in duration-200',
        variantStyles[variant]
      )}
      role="alert"
    >
      <div className="flex items-center gap-2">
        <span className="font-medium">{message}</span>
        <button
          onClick={onClose}
          className="ml-2 opacity-80 hover:opacity-100"
          aria-label="Close"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export { Toast };