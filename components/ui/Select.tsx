import { forwardRef, SelectHTMLAttributes } from 'react';
import { LuChevronDown } from 'react-icons/lu';
import { cn } from '@/lib/utils/cn';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: SelectOption[];
  placeholder?: string;
}

const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, options, placeholder, className, ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label className="block text-sm font-medium text-foreground mb-1.5">
            {label}
          </label>
        )}
        <div className="relative">
          <select
            ref={ref}
            className={cn(
              'w-full appearance-none rounded-lg border bg-background px-4 py-2.5 text-foreground',
              'border-stroke focus:outline-none focus:ring-2 focus:ring-brand-primary focus:border-brand-primary',
              'transition-all duration-200',
              error && 'border-error focus:ring-error focus:border-error',
              className
            )}
            {...props}
          >
            {placeholder && (
              <option value="" disabled={!props.value}>
                {placeholder}
              </option>
            )}
            {options.map((option) => (
              <option key={option.value} value={option.value} disabled={option.disabled}>
                {option.label}
              </option>
            ))}
          </select>
          <LuChevronDown className="pointer-events-none absolute top-1/2 -translate-y-1/2 right-3 h-5 w-5 text-secondary" />
        </div>
        {error && (
          <p className="mt-1.5 text-sm text-error">{error}</p>
        )}
      </div>
    );
  }
);

Select.displayName = 'Select';

export { Select };
export default Select;