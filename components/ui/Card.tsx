import { cn } from '@/lib/utils/cn';
import { forwardRef, HTMLAttributes } from 'react';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padding?: 'none' | 'sm' | 'md' | 'lg';
  shadow?: 'none' | 'sm' | 'md';
}

const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ padding = 'md', shadow = 'sm', className, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'rounded-lg bg-card-bg border border-stroke',
          {
            'p-0': padding === 'none',
            'p-3': padding === 'sm',
            'p-5': padding === 'md',
            'p-7': padding === 'lg',
            'shadow-none': shadow === 'none',
            'shadow-sm': shadow === 'sm',
            'shadow-md': shadow === 'md',
          },
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Card.displayName = 'Card';

export { Card };
export default Card;