import * as React from 'react';
import { Slot } from 'radix-ui';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  "inline-flex shrink-0 select-none items-center justify-center gap-1.5 whitespace-nowrap text-sm font-medium outline-none transition-[background-color,box-shadow,color,transform,filter] duration-150 active:scale-[0.97] focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        // The one place the accent glows: the primary action on a screen.
        default: 'bg-primary text-primary-foreground shadow-glow hover:brightness-110',
        destructive: 'bg-destructive text-destructive-foreground shadow-sm hover:brightness-110',
        outline: 'border bg-card text-foreground shadow-xs hover:bg-accent dark:bg-accent dark:hover:bg-foreground/10',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-foreground/10',
        ghost: 'text-foreground/80 hover:bg-accent hover:text-foreground',
        link: 'text-primary underline-offset-4 hover:underline active:scale-100',
      },
      size: {
        default: 'h-8 rounded-md px-3.5 has-[>svg]:px-3',
        sm: 'h-7 rounded-sm px-2.5 text-[12.5px] has-[>svg]:px-2',
        lg: 'h-10 rounded-lg px-5 text-base has-[>svg]:px-4',
        icon: 'size-8 rounded-md',
        'icon-sm': 'size-7 rounded-sm',
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
  ...props
}: React.ComponentProps<'button'> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : 'button';
  return <Comp data-slot="button" className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}

export { Button, buttonVariants };
