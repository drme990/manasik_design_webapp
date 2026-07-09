import { cn } from '@/lib/utils/cn';

export interface ProgressBarProps {
  progress: number;
  size?: 'sm' | 'md';
  color?: 'primary' | 'success' | 'warning' | 'error';
  showLabel?: boolean;
  className?: string;
}

export default function ProgressBar({
  progress,
  size = 'md',
  color = 'primary',
  showLabel = true,
  className,
}: ProgressBarProps) {
  const clampedProgress = Math.min(Math.max(progress, 0), 100);

  const colorClasses = {
    primary: 'bg-brand-primary',
    success: 'bg-success',
    warning: 'bg-warning',
    error: 'bg-error',
  };

  const sizeClasses = {
    sm: 'h-1.5',
    md: 'h-2.5',
  };

  return (
    <div className={cn('w-full', className)}>
      <div className={cn('w-full rounded-full bg-stroke overflow-hidden', sizeClasses[size])}>
        <div
          className={cn('rounded-full transition-all duration-300', colorClasses[color])}
          style={{ width: `${clampedProgress}%` }}
        />
      </div>
      {showLabel && (
        <p className="mt-1.5 text-xs text-secondary text-center">
          {Math.round(clampedProgress)}%
        </p>
      )}
    </div>
  );
}

export { ProgressBar };