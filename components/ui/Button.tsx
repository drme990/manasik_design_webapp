import { ButtonHTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/utils/cn';
import { LuLoaderCircle } from 'react-icons/lu';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
    size?: 'sm' | 'md' | 'lg';
    loading?: boolean;
    children: React.ReactNode;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
    ({ variant = 'primary', size = 'md', loading = false, children, disabled, className = '', ...props }, ref) => {
        const baseStyles = 'inline-flex items-center justify-center rounded-lg font-medium transition-all duration-200 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed';

        const variantStyles = {
            primary: 'bg-brand-primary text-primary-text hover:bg-brand-primary-dark',
            secondary: 'bg-brand-secondary text-white hover:opacity-90',
            outline: 'border-2 border-brand-primary text-brand-primary hover:bg-brand-primary-light',
            ghost: 'text-foreground hover:bg-muted',
            danger: 'bg-error text-white hover:opacity-90',
        };

        const sizeStyles = {
            sm: 'px-3 py-1.5 text-sm',
            md: 'px-4 py-2 text-base',
            lg: 'px-6 py-3 text-lg',
        };

        return (
            <button
                ref={ref}
                disabled={disabled || loading}
                className={cn(baseStyles, variantStyles[variant], sizeStyles[size], className)}
                {...props}
            >
                {loading && (
                    <LuLoaderCircle className="animate-spin -me-1 ms-2 h-4 w-4" />
                )}
                {children}
            </button>
        );
    }
);

Button.displayName = 'Button';

export { Button };
export default Button;