'use client';

import { useInView, useTicker } from '@/components/site/home/motion';
import { cn } from '@/lib/utils';

/** A command typed out on a screen while in view, then its answer. Loops. Reduced motion shows both. */
export function TypedCall({ call, reply, className }: { call: string; reply: string; className?: string }) {
  const [ref, inView] = useInView<HTMLDivElement>();
  const tick = useTicker(24, inView, call.length + 40) % (call.length + 110);
  const typed = call.slice(0, tick);
  const answered = tick > call.length + 12;

  return (
    <div ref={ref} aria-hidden="true" className={cn('screen w-full min-w-0 p-5 font-mono text-[12px] leading-[1.7] sm:p-6 sm:text-[12.5px]', className)}>
      <pre className="whitespace-pre-wrap break-all text-screen-foreground/85">
        <span className="text-primary">$ </span>
        {/* The full call keeps the height steady; the untyped part is invisible. */}
        {typed}
        {!answered ? <span className="ml-px inline-block h-[1.1em] w-[0.55em] translate-y-[0.2em] bg-screen-foreground/80 motion-safe:animate-blink" /> : null}
        <span className="invisible">{call.slice(typed.length)}</span>
      </pre>
      <p className={cn('mt-2 text-chart-1 transition-opacity duration-300', answered ? 'opacity-100' : 'opacity-0')}>{reply}</p>
    </div>
  );
}
