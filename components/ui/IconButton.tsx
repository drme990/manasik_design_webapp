import { ButtonHTMLAttributes, forwardRef, ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  label: string;
}

const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ icon, variant = 'ghost', size = 'md', label, className, ...props }, ref) => {
    const baseStyles = 'inline-flex items-center justify-center rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed';

    const variantStyles = {
      primary: 'bg-brand-primary text-primary-text hover:bg-brand-primary-dark focus:ring-brand-primary',
      secondary: 'bg-brand-secondary text-white hover:opacity-90 focus:ring-brand-secondary',
      ghost: 'text-foreground hover:bg-muted focus:ring-secondary',
      danger: 'text-error hover:bg-error/10 focus:ring-error',
    };

    const sizeStyles = {
      sm: 'p-1.5',
      md: 'p-2',
      lg: 'p-3',
    };

    const iconSizeStyles = {
      sm: 'h-4 w-4',
      md: 'h-5 w-5',
      lg: 'h-6 w-6',
    };

    return (
      <button
        ref={ref}
        aria-label={label}
        className={cn(baseStyles, variantStyles[variant], sizeStyles[size], className)}
        {...props}
      >
        <span className={cn(iconSizeStyles[size])}>{icon}</span>
      </button>
    );
  }
);

IconButton.displayName = 'IconButton';

export { IconButton };
export default IconButton;