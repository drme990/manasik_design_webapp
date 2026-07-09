import { forwardRef, TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/utils/cn';

export interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(
  ({ label, error, className, ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label className="block text-sm font-medium text-foreground mb-1.5">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          className={cn(
            'w-full rounded-lg border bg-background px-4 py-2.5 text-foreground',
            'border-stroke placeholder:text-secondary',
            'focus:outline-none focus:ring-2 focus:ring-brand-primary focus:border-brand-primary',
            'transition-all duration-200 resize-none',
            error && 'border-error focus:ring-error focus:border-error',
            className
          )}
          {...props}
        />
        {error && (
          <p className="mt-1.5 text-sm text-error">{error}</p>
        )}
      </div>
    );
  }
);

TextArea.displayName = 'TextArea';

export { TextArea };
export default TextArea;