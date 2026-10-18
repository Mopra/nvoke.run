import * as React from 'react';
import { Slot } from 'radix-ui';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

// Every filled button is a keycap: square, a mono label in capitals, and it sinks when pressed.
const buttonVariants = cva(
  "inline-flex shrink-0 select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-[4px] font-mono text-[12px] font-medium tracking-[0.07em] uppercase outline-none transition-[background-color,box-shadow,color,transform,filter] duration-150 focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        // The one place the accent glows: the primary action on a screen.
        default: 'key key-primary bg-primary text-primary-foreground hover:brightness-110',
        destructive: 'key bg-destructive text-destructive-foreground hover:brightness-110',
        // Light keycaps: outline, secondary and glass are the same cap under three names.
        outline: 'key bg-secondary text-secondary-foreground hover:brightness-[0.97]',
        secondary: 'key bg-secondary text-secondary-foreground hover:brightness-[0.97]',
        glass: 'key bg-secondary text-secondary-foreground hover:brightness-[0.97]',
        // Flat: printed on the chassis, no cap.
        ghost: 'text-foreground/75 hover:bg-foreground/[0.06] hover:text-foreground',
        link: 'font-sans text-sm normal-case tracking-normal text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-8 px-4 has-[>svg]:px-3.5',
        sm: 'h-7 px-3 text-[11.5px] has-[>svg]:px-2.5',
        lg: 'h-10 px-6 text-[12.5px] has-[>svg]:px-5',
        icon: 'size-8',
        'icon-sm': 'size-7',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  type,
  ...props
}: React.ComponentProps<'button'> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : 'button';
  // A plain button never submits the form around it by accident; submit buttons say so.
  return (
    <Comp
      data-slot="button"
      type={asChild ? type : (type ?? 'button')}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
