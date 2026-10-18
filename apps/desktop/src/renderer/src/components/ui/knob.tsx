import { useRef, type KeyboardEvent, type PointerEvent, type WheelEvent } from 'react';
import { cn } from '@/lib/utils';

/**
 * A knob with detents: one of a few values, read off the tick it points at.
 * Click to step, scroll or drag up and down, or use the arrow keys. The cap
 * springs to the chosen tick.
 */
export function Knob<T extends number>({
  value,
  options,
  onChange,
  label,
  format = String,
  size = 150,
  className,
}: {
  value: T;
  options: T[];
  onChange: (value: T) => void;
  label: string;
  format?: (value: T) => string;
  size?: number;
  className?: string;
}) {
  const index = Math.max(0, options.indexOf(value));
  const span = 240;
  const angleOf = (i: number): number => -span / 2 + (span / Math.max(1, options.length - 1)) * i;
  const drag = useRef<{ y: number; index: number } | null>(null);

  function step(by: number): void {
    const next = options[Math.min(options.length - 1, Math.max(0, index + by))];
    if (next !== undefined && next !== value) onChange(next);
  }
  function onKeyDown(event: KeyboardEvent): void {
    const by = event.key === 'ArrowRight' || event.key === 'ArrowUp' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? -1 : 0;
    if (!by) return;
    event.preventDefault();
    step(by);
  }
  function onWheel(event: WheelEvent): void {
    event.preventDefault();
    step(event.deltaY > 0 ? 1 : -1);
  }
  function onPointerDown(event: PointerEvent<HTMLButtonElement>): void {
    drag.current = { y: event.clientY, index };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function onPointerMove(event: PointerEvent<HTMLButtonElement>): void {
    if (!drag.current) return;
    // Thirty pixels of travel per detent.
    const moved = Math.round((drag.current.y - event.clientY) / 30);
    const next = options[Math.min(options.length - 1, Math.max(0, drag.current.index + moved))];
    if (next !== undefined && next !== value) onChange(next);
  }
  function onPointerUp(event: PointerEvent<HTMLButtonElement>): void {
    // A tap without travel steps to the next detent.
    if (drag.current && Math.abs(drag.current.y - event.clientY) < 4) step(index === options.length - 1 ? -(options.length - 1) : 1);
    drag.current = null;
  }

  const radius = size / 2 - 10;
  const cap = size * 0.56;
  return (
    <div className={cn('relative', className)} style={{ width: size, height: size }}>
      {options.map((option, i) => {
        const a = ((angleOf(i) - 90) * Math.PI) / 180;
        return (
          <button
            key={option}
            type="button"
            tabIndex={-1}
            aria-hidden
            onClick={() => onChange(option)}
            className={cn(
              'absolute top-1/2 left-1/2 font-mono text-[11px] font-medium tabular-nums outline-none transition-colors',
              i === index ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
            )}
            style={{ transform: `translate(${Math.cos(a) * radius}px, ${Math.sin(a) * radius}px) translate(-50%, -50%)` }}
          >
            {format(option)}
          </button>
        );
      })}
      <button
        type="button"
        role="slider"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={options.length - 1}
        aria-valuenow={index}
        aria-valuetext={format(value)}
        onKeyDown={onKeyDown}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => (drag.current = null)}
        className="knob-cap absolute top-1/2 left-1/2 cursor-grab touch-none rounded-full outline-none transition-transform duration-300 ease-spring select-none active:cursor-grabbing focus-visible:ring-[3px] focus-visible:ring-ring/50"
        style={{ width: cap, height: cap, margin: -cap / 2, transform: `rotate(${angleOf(index)}deg)` }}
      >
        <span aria-hidden className="absolute top-2.5 left-1/2 h-4 w-1 -translate-x-1/2 rounded-full bg-primary-foreground" />
      </button>
    </div>
  );
}
