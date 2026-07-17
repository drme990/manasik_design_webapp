import { ButtonHTMLAttributes, forwardRef } from 'react';
import { LuLoaderCircle } from 'react-icons/lu';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
    size?: 'sm' | 'md' | 'lg';
    loading?: boolean;
    children: React.ReactNode;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
    ({ variant = 'primary', size = 'md', loading = false, children, disabled, className = '', ...props }, ref) => {
        const baseStyles = 'inline-flex items-center justify-center rounded-lg font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed';

        const variantStyles = {
            primary: 'bg-brand-primary text-primary-text hover:bg-brand-primary-dark focus:ring-brand-primary',
            secondary: 'bg-brand-secondary text-white hover:opacity-90 focus:ring-brand-secondary',
            outline: 'border-2 border-brand-primary text-brand-primary hover:bg-brand-primary-light focus:ring-brand-primary',
            ghost: 'text-foreground hover:bg-muted focus:ring-secondary',
            danger: 'bg-error text-white hover:opacity-90 focus:ring-error',
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
                className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
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