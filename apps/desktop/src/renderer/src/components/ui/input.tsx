import * as React from 'react';
import { cn } from '@/lib/utils';

/** A recessed plate, set in the mono. */
function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'flex h-8 w-full min-w-0 rounded-[4px] bg-card px-2.5 font-mono text-xs shadow-[inset_0_1px_2px_var(--shadow-strong)] outline-none transition-[box-shadow] duration-150 placeholder:text-muted-foreground/70 disabled:opacity-50',
        'focus-visible:ring-[3px] focus-visible:ring-ring/25',
        'aria-invalid:ring-[3px] aria-invalid:ring-destructive/25',
        '[&::-webkit-inner-spin-button]:appearance-none',
        className,
      )}
      {...props}
    />
  );
}

/**
 * A borderless field for inset grouped forms, where the row is the box.
 * Focus shows as a soft ring on the field itself.
 */
function PlainInput({ className, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      data-slot="input"
      className={cn(
        'h-8 w-full min-w-0 rounded-sm bg-transparent px-2 text-sm outline-none transition-shadow duration-150 placeholder:text-muted-foreground/60 disabled:opacity-50',
        'focus-visible:ring-[3px] focus-visible:ring-ring/25',
        'aria-invalid:placeholder:text-destructive/80',
        '[&::-webkit-inner-spin-button]:appearance-none',
        className,
      )}
      {...props}
    />
  );
}

export { Input, PlainInput };
