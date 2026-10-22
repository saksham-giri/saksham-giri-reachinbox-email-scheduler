import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '../../utils/cn';

type InputVariant = 'filled' | 'line' | 'box';

const variantClass: Record<InputVariant, string> = {
  // Large grey field (login screen)
  filled: 'h-14 w-full rounded-xl bg-surface px-5 text-[15px] focus:ring-2 focus:ring-brand-500/30',
  // Borderless input sitting on an underlined row (compose To / Subject)
  line: 'h-10 w-full bg-transparent px-0 text-[15px]',
  // Small bordered box (compose delay / hourly limit)
  box: 'h-12 w-24 shrink-0 rounded-lg border border-gray-200 px-3 text-[17px] focus:border-brand-500',
};

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  variant?: InputVariant;
  invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ variant = 'filled', invalid, className, ...rest }, ref) {
  return (
    <input
      ref={ref}
      className={cn(
        'text-gray-900 placeholder:text-gray-400 focus:outline-none',
        variantClass[variant],
        invalid && (variant === 'line' ? 'placeholder:text-red-300' : 'ring-2 ring-red-300'),
        className,
      )}
      {...rest}
    />
  );
});

/** Label-on-the-left row used throughout the compose screen. */
export function FormRow({
  label,
  htmlFor,
  error,
  underline,
  children,
  className,
}: {
  label: string;
  htmlFor?: string;
  error?: string;
  underline?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="flex items-center gap-4">
        <label htmlFor={htmlFor} className="w-16 shrink-0 text-[15px] text-gray-900">
          {label}
        </label>
        <div className={cn('flex min-w-0 flex-1 items-center gap-2', underline && 'border-b border-gray-200', underline && error && 'border-red-300')}>
          {children}
        </div>
      </div>
      {error && <p className="ml-20 mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
