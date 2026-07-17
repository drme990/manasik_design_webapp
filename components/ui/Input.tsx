import { forwardRef, InputHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
    label?: string;
    error?: string;
    helperText?: string;
    suffix?: ReactNode;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
    ({ label, error, helperText, suffix, className, id, ...props }, ref) => {
        const inputId = id || (typeof label === 'string' ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

        return (
            <div className="w-full space-y-2">
                {label && (
                    <label htmlFor={inputId} className="block text-sm font-medium text-foreground">
                        {label}
                        {props.required && <span className="text-error ms-1">*</span>}
                    </label>
                )}
                <div className="relative flex items-center">
                    <input
                        ref={ref}
                        id={inputId}
                        className={cn(
                            'w-full rounded-lg border bg-background px-4 py-2.5 text-foreground',
                            'border-stroke placeholder:text-secondary/50',
                            'focus:outline-none focus:ring-2 focus:ring-brand-primary focus:border-brand-primary',
                            'transition-all duration-200',
                            'disabled:opacity-50 disabled:cursor-not-allowed',
                            suffix && 'pe-10',
                            error && 'border-error focus:ring-error focus:border-error',
                            className
                        )}
                        {...props}
                    />
                    {suffix && (
                        <div className="absolute inset-e-3 flex items-center">{suffix}</div>
                    )}
                </div>
                {(error || helperText) && (
                    <p className={cn('text-sm', error ? 'text-error' : 'text-secondary')}>
                        {error || helperText}
                    </p>
                )}
            </div>
        );
    }
);

Input.displayName = 'Input';

export { Input };
export default Input;