import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/**
 * A plate: the lifted off-white panel on the chassis, with a hairline rim and
 * a lip (the `panel` part). The cards of the sign-in, claim and billing
 * pages. Same names as a card, so a page swaps one import.
 */
export function Card({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="plate" className={cn('panel flex flex-col gap-6 py-6 sm:py-7', className)} {...props} />;
}

export function CardHeader({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('grid auto-rows-min gap-1.5 px-6 sm:px-7', className)} {...props} />;
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
  return <div className={cn('px-6 sm:px-7', className)} {...props} />;
}

/** The plate's keys, on a hairline. */
export function CardFooter({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('flex items-center border-t border-border px-6 pt-5 sm:px-7', className)} {...props} />;
}
