import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * The parts of a form written as a sentence ("Find dentists in Austin"):
 * thin lead words in one grid column, the fields in regular display type in
 * the next. The parent is a `grid grid-cols-[max-content_minmax(0,1fr)]`.
 */
export const SENTENCE =
  'min-w-0 bg-transparent font-display text-4xl font-normal caret-primary outline-none placeholder:text-foreground/30 aria-invalid:placeholder:text-destructive/40';

/**
 * One line of the sentence: a thin lead word, then the field in display type.
 * The lead words share one column of the parent grid, so the fields align.
 */
export function Line({ lead, htmlFor, children }: { lead: string; htmlFor: string; children: ReactNode }) {
  return (
    <div className="group/line contents">
      <label htmlFor={htmlFor} className="self-baseline pb-2 font-display text-4xl font-light text-muted-foreground">
        {lead}
      </label>
      <div className="relative min-w-0 self-baseline pb-2">
        {children}
        {/* A hairline that turns orange while the line has focus. */}
        <span className="absolute inset-x-0 bottom-0 h-px bg-border transition-colors duration-300 group-focus-within/line:bg-primary" />
      </div>
    </div>
  );
}

export function SentenceInput({ className, ...props }: ComponentProps<'input'>) {
  return <input autoComplete="off" spellCheck={false} {...props} className={cn(SENTENCE, 'w-full', className)} />;
}

/** Small keycaps under a line: toggles and quick values with `pressed`, plain actions without. */
export function Pill({ pressed, className, ...props }: ComponentProps<'button'> & { pressed?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      {...props}
      className={cn(
        'key inline-flex h-7 items-center gap-1.5 px-2.5 font-mono text-[12px] font-medium tracking-[0.05em] uppercase tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-40',
        pressed ? 'key-down bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground hover:brightness-[0.97]',
        className,
      )}
    />
  );
}
