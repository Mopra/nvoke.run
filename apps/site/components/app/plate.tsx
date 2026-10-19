import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/**
 * A group on the page, unboxed: a hairline over it and space around it, as on
 * the site. The cards of the sign-in, claim and billing pages. Same names as
 * a card, so a page swaps one import.
 */
export function Card({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="plate" className={cn('flex flex-col gap-6 border-t pt-6 pb-2', className)} {...props} />;
}

export function CardHeader({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('grid auto-rows-min gap-1.5', className)} {...props} />;
}

/** A printed label over the title: what the plate is about. */
export function CardLabel({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('cap mb-2 text-muted-foreground', className)} {...props} />;
}

export function CardTitle({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('font-display text-[22px] leading-tight font-light tracking-[-0.01em]', className)} {...props} />;
}

export function CardDescription({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('text-sm text-muted-foreground', className)} {...props} />;
}

export function CardContent({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn(className)} {...props} />;
}

/** The plate's keys, on a hairline. */
export function CardFooter({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('flex items-center border-t border-border pt-5', className)} {...props} />;
}
