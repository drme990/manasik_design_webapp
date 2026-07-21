'use client';

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { cn } from '@/lib/utils/cn';
import { LuX, LuCircleCheck, LuLoaderCircle, LuCircleAlert } from 'react-icons/lu';

export interface ToastItem {
  id: string;
  message: string;
  variant: 'success' | 'error' | 'warning' | 'info' | 'progress';
  progress?: number; // 0–100
  duration?: number; // ms — omitted for progress toasts (managed manually)
}

interface ToastContextValue {
  toasts: ToastItem[];
  showToast: (toast: Omit<ToastItem, 'id'>) => string;
  updateToast: (id: string, updates: Partial<ToastItem>) => void;
  dismissToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return ctx;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const showToast = useCallback(
    (toast: Omit<ToastItem, 'id'>) => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setToasts((prev) => [...prev, { ...toast, id }]);
      // Auto-dismiss for non-progress toasts with a duration
      if (toast.variant !== 'progress' && toast.duration !== 0) {
        const timer = setTimeout(() => dismissToast(id), toast.duration ?? 3000);
        timersRef.current.set(id, timer);
      }
      return id;
    },
    [dismissToast]
  );

  const updateToast = useCallback(
    (id: string, updates: Partial<ToastItem>) => {
      setToasts((prev) =>
        prev.map((t) => (t.id === id ? { ...t, ...updates } : t))
      );
      // If updating to a non-progress variant with duration, schedule dismiss
      if (
        updates.variant &&
        updates.variant !== 'progress' &&
        updates.duration !== 0
      ) {
        const timer = setTimeout(
          () => dismissToast(id),
          updates.duration ?? 3000
        );
        timersRef.current.set(id, timer);
      }
    },
    [dismissToast]
  );

  return (
    <ToastContext.Provider
      value={{ toasts, showToast, updateToast, dismissToast }}
    >
      {children}
      {/* Toast viewport — bottom center */}
      <div className="pointer-events-none fixed bottom-4 left-1/2 z-200 flex w-full max-w-sm -translate-x-1/2 flex-col gap-2 px-4">
        {toasts.map((toast) => (
          <ToastCard key={toast.id} toast={toast} onDismiss={dismissToast} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastCard({
  toast,
  onDismiss,
}: {
  toast: ToastItem;
  onDismiss: (id: string) => void;
}) {
  const variantStyles: Record<ToastItem['variant'], string> = {
    success: 'bg-success text-white',
    error: 'bg-error text-white',
    warning: 'bg-warning text-foreground',
    info: 'bg-info text-white',
    progress: 'bg-card-bg text-foreground border border-stroke',
  };

  return (
    <div
      className={cn(
        'pointer-events-auto rounded-xl px-4 py-3 shadow-lg',
        'animate-in slide-in-from-bottom-2 fade-in duration-200',
        variantStyles[toast.variant]
      )}
      role="alert"
    >
      <div className="flex items-center gap-2.5">
        {toast.variant === 'success' && (
          <LuCircleCheck className="h-5 w-5 shrink-0" />
        )}
        {toast.variant === 'error' && (
          <LuCircleAlert className="h-5 w-5 shrink-0" />
        )}
        {toast.variant === 'progress' && (
          <LuLoaderCircle className="h-5 w-5 shrink-0 animate-spin text-brand-primary" />
        )}
        <span className="flex-1 text-sm font-medium">{toast.message}</span>
        {toast.variant !== 'progress' && (
          <button
            onClick={() => onDismiss(toast.id)}
            className="opacity-70 transition-opacity hover:opacity-100"
            aria-label="Close"
          >
            <LuX className="h-4 w-4" />
          </button>
        )}
      </div>
      {toast.variant === 'progress' && (
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-brand-primary transition-[width] duration-200 ease-out"
            style={{ width: `${Math.min(100, Math.max(0, toast.progress ?? 0))}%` }}
          />
        </div>
      )}
    </div>
  );
}
