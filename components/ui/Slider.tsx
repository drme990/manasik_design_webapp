import { forwardRef, InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils/cn';

export interface SliderProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string;
}

const Slider = forwardRef<HTMLInputElement, SliderProps>(
  ({ label, className, ...props }, ref) => {
    return (
      <div className={cn('w-full', className)}>
        {label && (
          <label className="block text-sm font-medium text-foreground mb-2">
            {label}
          </label>
        )}
        <input
          ref={ref}
          type="range"
          className={cn(
            'w-full h-2 rounded-lg appearance-none cursor-pointer',
            'bg-stroke accent-brand-primary',
            'focus:outline-none focus:ring-2 focus:ring-brand-primary'
          )}
          {...props}
        />
      </div>
    );
  }
);

Slider.displayName = 'Slider';

export { Slider };
export default Slider;