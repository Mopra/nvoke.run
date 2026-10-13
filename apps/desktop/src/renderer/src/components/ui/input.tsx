import * as React from 'react';
import { cn } from '@/lib/utils';

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'flex h-8 w-full min-w-0 rounded-md border border-input bg-card px-2.5 text-sm shadow-xs outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-muted-foreground/70 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-foreground/5',
        'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/25',
        'aria-invalid:border-destructive/70 aria-invalid:ring-destructive/15',
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
        'h-8 w-full min-w-0 rounded-sm bg-transparent px-2 text-sm outline-none transition-shadow duration-150 placeholder:text-muted-foreground/60',
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
