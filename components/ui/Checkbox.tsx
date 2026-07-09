import { forwardRef, InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils/cn';

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string;
}

const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ label, className, ...props }, ref) => {
    return (
      <label className={cn('inline-flex items-center gap-3 cursor-pointer', className)}>
        <div className="relative flex h-5 w-5 items-center justify-center">
          <input
            ref={ref}
            type="checkbox"
            className="peer sr-only"
            {...props}
          />
          <span className="absolute inset-0 rounded border border-stroke bg-background transition-colors peer-checked:border-brand-primary peer-checked:bg-brand-primary" />
          <svg
            className="relative h-3.5 w-3.5 text-primary-text opacity-0 peer-checked:opacity-100 transition-opacity"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        {label && (
          <span className="text-sm font-medium text-foreground">{label}</span>
        )}
      </label>
    );
  }
);

Checkbox.displayName = 'Checkbox';

export { Checkbox };
export default Checkbox;