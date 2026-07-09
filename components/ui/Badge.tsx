import { cn } from '@/lib/utils/cn';
import { HTMLAttributes } from 'react';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'info';
  size?: 'sm' | 'md';
}

export default function Badge({
  variant = 'primary',
  size = 'sm',
  className,
  children,
  ...props
}: BadgeProps) {
  const variantStyles = {
    primary: 'bg-brand-primary-light text-brand-primary-dark',
    secondary: 'bg-muted text-secondary',
    success: 'bg-success/10 text-success',
    warning: 'bg-warning/10 text-warning',
    error: 'bg-error/10 text-error',
    info: 'bg-info/10 text-info',
  };

  const sizeStyles = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-2.5 py-1 text-sm',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full font-medium',
        variantStyles[variant],
        sizeStyles[size],
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}

export { Badge };