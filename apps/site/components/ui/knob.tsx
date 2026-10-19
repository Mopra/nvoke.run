'use client';

import { useRef, useState, type KeyboardEvent, type PointerEvent, type WheelEvent } from 'react';
import { cn } from '@/lib/utils';

/**
 * A knob with detents: one of a few values, read off the tick it points at.
 * Hold it and turn it round with the pointer, as a real knob: it turns by as
 * much as the hand does, from where it was, and stops hard at both ends. It
 * picks the nearest tick on the way; let go and the cap springs onto it. Click to step,
 * scroll, or use the arrow keys.
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
  const drag = useRef<{ cx: number; cy: number; x: number; y: number; moved: boolean; last: number; turned: number } | null>(null);
  // The pointer's angle while the knob is held, so the cap follows the hand and snaps on release.
  const [held, setHeld] = useState<number | null>(null);

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
  /** Degrees clockwise from twelve o'clock, from -180 to 180, of a point around the knob's centre. */
  function angleAt(x: number, y: number): number {
    const d = drag.current!;
    return (Math.atan2(x - d.cx, d.cy - y) * 180) / Math.PI;
  }
  function onPointerDown(event: PointerEvent<HTMLButtonElement>): void {
    const box = event.currentTarget.getBoundingClientRect();
    const d = { cx: box.left + box.width / 2, cy: box.top + box.height / 2, x: event.clientX, y: event.clientY, moved: false, last: 0, turned: angleOf(index) };
    drag.current = d;
    d.last = angleAt(event.clientX, event.clientY);
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function onPointerMove(event: PointerEvent<HTMLButtonElement>): void {
    const d = drag.current;
    if (!d) return;
    if (!d.moved && Math.hypot(event.clientX - d.x, event.clientY - d.y) < 4) return;
    d.moved = true;
    // Right over the centre the angle swings wildly; wait for the hand to move out.
    if (Math.hypot(event.clientX - d.cx, event.clientY - d.cy) < 12) return;
    const angle = angleAt(event.clientX, event.clientY);
    // The turn since the last move, the short way round, so crossing six o'clock is a small step, not a jump.
    const delta = ((angle - d.last + 540) % 360) - 180;
    d.last = angle;
    d.turned = Math.max(-span / 2, Math.min(span / 2, d.turned + delta));
    setHeld(d.turned);
    let nearest = 0;
    options.forEach((_, i) => {
      if (Math.abs(angleOf(i) - d.turned) < Math.abs(angleOf(nearest) - d.turned)) nearest = i;
    });
    const next = options[nearest];
    if (next !== undefined && next !== value) onChange(next);
  }
  function onPointerUp(): void {
    // A tap without travel steps to the next detent.
    if (drag.current && !drag.current.moved) step(index === options.length - 1 ? -(options.length - 1) : 1);
    drag.current = null;
    setHeld(null);
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
        onPointerCancel={() => {
          drag.current = null;
          setHeld(null);
        }}
        className={cn(
          'knob-cap absolute top-1/2 left-1/2 cursor-grab touch-none rounded-full outline-none select-none active:cursor-grabbing focus-visible:ring-[3px] focus-visible:ring-ring/50',
          held === null && 'transition-transform duration-300 ease-spring',
        )}
        style={{ width: cap, height: cap, margin: -cap / 2, transform: `rotate(${held ?? angleOf(index)}deg)` }}
      >
        <span aria-hidden className="absolute top-2.5 left-1/2 h-4 w-1 -translate-x-1/2 rounded-full bg-primary-foreground" />
      </button>
    </div>
  );
}
