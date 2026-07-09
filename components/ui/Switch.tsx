import { forwardRef, InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils/cn';

export interface SwitchProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string;
}

const Switch = forwardRef<HTMLInputElement, SwitchProps>(
  ({ label, className, ...props }, ref) => {
    return (
      <label className={cn('inline-flex items-center gap-3 cursor-pointer', className)}>
        <div className="relative inline-flex h-6 w-11 items-center">
          <input
            ref={ref}
            type="checkbox"
            className="peer sr-only"
            {...props}
          />
          <span className="absolute inset-0 rounded-full bg-stroke transition-colors peer-checked:bg-brand-primary" />
          <span className="absolute left-1 h-4 w-4 rounded-full bg-white transition-transform peer-checked:translate-x-5" />
        </div>
        {label && (
          <span className="text-sm font-medium text-foreground">{label}</span>
        )}
      </label>
    );
  }
);

Switch.displayName = 'Switch';

export { Switch };
export default Switch;