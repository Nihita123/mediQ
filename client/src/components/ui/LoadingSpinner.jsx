/**
 * components/ui/LoadingSpinner.jsx
 *
 * Accessible animated spinner with optional label.
 */

import { cn } from '../../utils/cn';

/**
 * @param {object} props
 * @param {'sm'|'md'|'lg'} props.size
 * @param {string} [props.label]
 * @param {string} [props.className]
 */
export default function LoadingSpinner({ size = 'md', label, className }) {
  const sizeMap = {
    sm: 'h-5 w-5 border-2',
    md: 'h-8 w-8 border-3',
    lg: 'h-12 w-12 border-4',
  };

  return (
    <div
      role="status"
      aria-label={label || 'Loading'}
      className={cn('flex flex-col items-center justify-center gap-2', className)}
    >
      <div
        className={cn(
          'rounded-full border-primary border-t-transparent animate-spin',
          sizeMap[size]
        )}
      />
      {label && <p className="text-sm text-muted-foreground">{label}</p>}
    </div>
  );
}

/** Full-screen loading overlay */
export function FullPageSpinner({ label = 'Loading...' }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <LoadingSpinner size="lg" label={label} />
    </div>
  );
}
