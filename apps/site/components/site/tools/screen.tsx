import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import type { Tone } from './status-pill';

/*
 * The tools' display: the same black dot matrix screen as the homepage.
 * Each tool reads out on it: a sample while it waits, the run while it
 * works, the verdict when it is done.
 */

export type Lamp = Tone | 'busy' | 'off';

const LAMP: Record<Lamp, string> = {
  good: 'bg-chart-1 shadow-[0_0_6px_var(--chart-1)]',
  warn: 'bg-chart-2 shadow-[0_0_6px_var(--chart-2)]',
  bad: 'bg-destructive shadow-[0_0_6px_var(--destructive)]',
  info: 'bg-chart-3 shadow-[0_0_6px_var(--chart-3)]',
  none: 'bg-screen-foreground/45',
  busy: 'led-on motion-safe:animate-blink',
  off: 'bg-screen-dim',
};

/** An LED on the screen. */
export function ScreenLed({ lamp, className }: { lamp: Lamp; className?: string }) {
  return <span aria-hidden="true" className={cn('led transition-colors duration-300', LAMP[lamp], className)} />;
}

/**
 * The display a tool reads out on. `mode` is the printed word by the LED
 * (Sample, Running, Result), `meta` the figure in the corner.
 */
export function ToolScreen({
  lamp,
  mode,
  meta,
  children,
  compact = false,
  className,
  hidden = false,
}: {
  lamp: Lamp;
  mode: string;
  meta?: ReactNode;
  children: ReactNode;
  compact?: boolean;
  className?: string;
  /** True for a sample: decoration, so screen readers skip it. */
  hidden?: boolean;
}) {
  return (
    <div
      aria-hidden={hidden || undefined}
      className={cn('screen screen-hero relative overflow-hidden', compact ? 'h-[19rem] p-5' : 'p-5 sm:p-8', className)}
    >
      <div className="flex items-center gap-3">
        <ScreenLed lamp={lamp} />
        <span className={cn('cap', lamp === 'busy' ? 'text-primary' : 'text-screen-foreground/55')}>{mode}</span>
        {meta ? <span className="cap ml-auto min-w-0 truncate text-screen-foreground/60 tabular-nums">{meta}</span> : null}
      </div>
      {children}
    </div>
  );
}

/** One channel on the screen: an LED, its name, and the word it reads. */
export function Channel({
  name,
  lamp,
  value,
  large = false,
}: {
  name: string;
  lamp: Lamp;
  value: string;
  large?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <span className="flex items-center gap-2">
        <ScreenLed lamp={lamp} />
        <span className="cap truncate text-screen-foreground/55">{name}</span>
      </span>
      <span
        className={cn(
          'lcd truncate leading-none uppercase transition-opacity duration-300',
          large ? 'text-[20px] sm:text-[26px]' : 'text-[16px] sm:text-[18px]',
          lamp === 'off' && 'opacity-30',
        )}
      >
        {value}
      </span>
    </div>
  );
}

