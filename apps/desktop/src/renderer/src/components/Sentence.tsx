import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * The parts of a form written as a sentence ("Find dentists in Austin"):
 * quiet lead words in one grid column, fields in display type in the next.
 * The parent is a `grid grid-cols-[max-content_minmax(0,1fr)]`.
 */
export const SENTENCE =
  'min-w-0 bg-transparent font-display text-4xl font-semibold caret-primary outline-none placeholder:text-foreground/[0.17] aria-invalid:placeholder:text-destructive/40';

/**
 * One line of the sentence: a quiet lead word, then the field in display type.
 * The lead words share one column of the parent grid, so the fields align.
 */
export function Line({ lead, htmlFor, children }: { lead: string; htmlFor: string; children: ReactNode }) {
  return (
    <div className="group/line contents">
      <label htmlFor={htmlFor} className="self-baseline pb-2 font-display text-4xl font-semibold text-muted-foreground/50">
        {lead}
      </label>
      <div className="relative min-w-0 self-baseline pb-2">
        {children}
        {/* A hairline that lights up with the accent while the line has focus. */}
        <span className="absolute inset-x-0 bottom-0 h-px bg-border transition-colors duration-300 group-focus-within/line:bg-primary/70" />
      </div>
    </div>
  );
}

export function SentenceInput({ className, ...props }: ComponentProps<'input'>) {
  return <input autoComplete="off" spellCheck={false} {...props} className={cn(SENTENCE, 'w-full', className)} />;
}

/** Small pills under a line: toggles and quick values with `pressed`, plain actions without. */
export function Pill({ pressed, className, ...props }: ComponentProps<'button'> & { pressed?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      {...props}
      className={cn(
        'h-7 rounded-full px-3 text-xs tabular-nums outline-none transition-colors duration-150 focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-40',
        pressed
          ? 'bg-foreground/[0.08] font-medium text-foreground'
          : 'text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground',
        className,
      )}
    />
  );
}
