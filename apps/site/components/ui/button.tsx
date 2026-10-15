import * as React from 'react';
import { Slot } from 'radix-ui';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  "inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap font-medium outline-none transition-[background-color,box-shadow,color,transform,filter] duration-150 active:scale-[0.98] focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        // The one place the accent glows: the primary action, as in the app.
        default: 'bg-primary text-primary-foreground shadow-glow hover:brightness-110',
        destructive: 'bg-destructive text-destructive-foreground shadow-sm hover:brightness-110',
        outline: 'bg-foreground/[0.055] text-foreground hover:bg-foreground/[0.09]',
        secondary: 'bg-foreground/[0.06] text-foreground hover:bg-foreground/10',
        ghost: 'text-foreground/75 hover:bg-foreground/[0.06] hover:text-foreground',
        glass: 'glass text-foreground/85 hover:text-foreground',
        link: 'text-primary underline-offset-4 hover:underline active:scale-100',
      },
      size: {
        default: 'h-10 rounded-full px-5 text-sm has-[>svg]:px-4',
        sm: 'h-8 rounded-full px-3.5 text-[13px] has-[>svg]:px-3',
        lg: 'h-12 rounded-full px-7 text-[15px] has-[>svg]:px-6',
        xl: 'h-14 rounded-full px-9 text-base has-[>svg]:px-8',
        icon: 'size-9 rounded-full',
        'icon-sm': 'size-7 rounded-full',
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
