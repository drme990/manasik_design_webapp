import { cn } from '@/lib/utils/cn';
import { LuLoaderCircle } from 'react-icons/lu';

export interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  color?: 'primary' | 'secondary' | 'white';
  className?: string;
}

export default function LoadingSpinner({
  size = 'md',
  color = 'primary',
  className,
}: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-8 w-8',
    lg: 'h-12 w-12',
  };

  const colorClasses = {
    primary: 'text-brand-primary',
    secondary: 'text-secondary',
    white: 'text-white',
  };

  return (
    <div className={cn('flex items-center justify-center', className)} role="status">
      <LuLoaderCircle className={cn('animate-spin', sizeClasses[size], colorClasses[color])} />
      <span className="sr-only">Loading...</span>
    </div>
  );
}

export { LoadingSpinner };