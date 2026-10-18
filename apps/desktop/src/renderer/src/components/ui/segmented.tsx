import { useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
  icon?: LucideIcon;
}

/**
 * A segmented control: one choice out of a few, with a thumb that springs to
 * the selected segment. Radio semantics; arrow keys move the selection.
 */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  size = 'md',
  stretch = false,
  className,
}: {
  value: T;
  onChange: (value: T) => void;
  options: SegmentedOption<T>[];
  label: string;
  size?: 'sm' | 'md';
  stretch?: boolean;
  className?: string;
}) {
  const refs = useRef(new Map<T, HTMLButtonElement>());
  const [thumb, setThumb] = useState<{ left: number; width: number } | null>(null);
  const [animate, setAnimate] = useState(false);

  useLayoutEffect(() => {
    const measure = (): void => {
      const el = refs.current.get(value);
      setThumb(el ? { left: el.offsetLeft, width: el.offsetWidth } : null);
    };
    measure();
    const observer = new ResizeObserver(measure);
    for (const el of refs.current.values()) observer.observe(el);
    return () => observer.disconnect();
  }, [value, options.length]);

  useLayoutEffect(() => {
    // Skip the spring on first paint so the thumb does not fly in from the left.
    const id = requestAnimationFrame(() => setAnimate(true));
    return () => cancelAnimationFrame(id);
  }, []);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const index = options.findIndex((o) => o.value === value);
    const next = options[(index + step + options.length) % options.length];
    if (!next) return;
    onChange(next.value);
    refs.current.get(next.value)?.focus();
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={cn(
        'relative isolate inline-flex shrink-0 rounded-full bg-foreground/[0.055] p-[3px] field:rounded-[6px] field:bg-foreground/[0.08] field:shadow-[inset_0_1px_2px_var(--shadow-color)]',
        stretch && 'flex w-full',
        className,
      )}
    >
      {thumb && (
        <span
          aria-hidden
          className={cn(
            'absolute inset-y-[3px] left-0 -z-10 rounded-full bg-card shadow-float dark:bg-foreground/15 field:key field:bg-secondary field:dark:bg-secondary',
            animate && 'transition-[transform,width] duration-[380ms] ease-spring',
          )}
          style={{ width: thumb.width, transform: `translateX(${thumb.left}px)` }}
        />
      )}
      {options.map((option) => {
        const active = option.value === value;
        const Icon = option.icon;
        return (
          <button
            key={option.value}
            ref={(el) => {
              if (el) refs.current.set(option.value, el);
              else refs.current.delete(option.value);
            }}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(option.value)}
            className={cn(
              'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-full font-medium outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring/50 field:rounded-[4px] field:font-mono field:text-[10px] field:tracking-[0.08em] field:uppercase',
              size === 'sm' ? 'h-6 px-3 text-xs' : 'h-8 px-4 text-sm',
              stretch && 'flex-1',
              active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {Icon && <Icon className={cn('shrink-0', size === 'sm' ? 'size-3.5' : 'size-[15px]')} />}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
