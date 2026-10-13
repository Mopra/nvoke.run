import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { ScanText } from 'lucide-react';
import { Kbd } from '@/components/ui/kbd';
import { cn } from '@/lib/utils';
import { grabApi } from '@/lib/desktop';
import type { GrabFrame, GrabRect } from '../../../ipc/contract';

/** Smaller boxes are a click, not a drag. Matches MIN_SIDE in screen-grab.ts. */
const MIN_SIDE = 8;

/**
 * The full screen overlay of Grab from screen. It paints the frozen frame
 * main captured, dims it, and lets the user drag a box over a list of
 * companies. Letting go sends the box to main, which reads it; Esc or a
 * click without a drag cancels.
 */
export function GrabOverlay() {
  const grab = grabApi();
  const [frame, setFrame] = useState<GrabFrame | null>(null);
  const [box, setBox] = useState<GrabRect | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    void grab?.getFrame().then(setFrame);
  }, [grab]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        grab?.cancel();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [grab]);

  function onPointerDown(event: PointerEvent<HTMLDivElement>): void {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    origin.current = { x: event.clientX, y: event.clientY };
    setBox({ x: event.clientX, y: event.clientY, width: 0, height: 0 });
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>): void {
    const start = origin.current;
    if (!start) return;
    setBox({
      x: Math.min(start.x, event.clientX),
      y: Math.min(start.y, event.clientY),
      width: Math.abs(event.clientX - start.x),
      height: Math.abs(event.clientY - start.y),
    });
  }

  function onPointerUp(): void {
    origin.current = null;
    if (box && box.width >= MIN_SIDE && box.height >= MIN_SIDE) grab?.select(box);
    else setBox(null);
  }

  const dragging = !!box && box.width >= MIN_SIDE && box.height >= MIN_SIDE;

  return (
    <div
      className="fixed inset-0 cursor-crosshair overflow-hidden select-none"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onContextMenu={(event) => {
        event.preventDefault();
        grab?.cancel();
      }}
    >
      {frame && <img src={frame.image} alt="" draggable={false} className="pointer-events-none absolute inset-0 size-full" />}
      {dragging ? (
        // The box stays clear and everything around it dims.
        <div
          className="pointer-events-none absolute rounded-[3px] shadow-[0_0_0_100vmax_var(--shade)] ring-[1.5px] ring-primary"
          style={{ left: box.x, top: box.y, width: box.width, height: box.height }}
        >
          <div className="absolute -bottom-7 right-0 rounded-full glass-strong px-2 py-0.5 text-2xs tabular-nums text-muted-foreground">
            {Math.round(box.width)} × {Math.round(box.height)}
          </div>
        </div>
      ) : (
        <div className="pointer-events-none absolute inset-0 bg-shade" />
      )}
      <div
        className={cn(
          'pointer-events-none absolute top-10 left-1/2 flex h-12 -translate-x-1/2 items-center gap-3 rounded-full glass-strong pr-3 pl-5 text-sm text-popover-foreground shadow-lg transition-opacity duration-200',
          dragging && 'opacity-0',
        )}
      >
        <ScanText className="size-4 text-primary" />
        <span>Drag over a list of companies</span>
        <span className="text-muted-foreground">Read on this computer</span>
        <Kbd>esc</Kbd>
      </div>
    </div>
  );
}
