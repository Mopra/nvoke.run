'use client';

import { useInView, useTicker } from '@/components/site/home/motion';
import { cn } from '@/lib/utils';

const CALL = `curl -X POST https://api.nvoke.run/v1/searches \\
  -d '{"kind":"local","params":{"niche":"dentists","location":"Austin"}}'`;
const REPLY = '201  {"status":"queued"}';

/** An agent's call typed out on a screen, then the API's answer. */
export function AgentCall() {
  const [ref, inView] = useInView<HTMLDivElement>();
  const tick = useTicker(28, inView, CALL.length + 40) % (CALL.length + 90);
  const typed = CALL.slice(0, tick);
  const answered = tick > CALL.length + 12;

  return (
    <div ref={ref} aria-hidden="true" className="screen mt-10 w-full p-5 font-mono text-[12px] leading-[1.7] sm:text-[12.5px]">
      <pre className="min-h-[3.4em] whitespace-pre-wrap break-all text-screen-foreground/85">
        <span className="text-primary">$ </span>
        {typed}
        {!answered ? <span className="ml-px inline-block h-[1.1em] w-[0.55em] translate-y-[0.2em] bg-screen-foreground/80 motion-safe:animate-blink" /> : null}
      </pre>
      <p className={cn('mt-2 text-chart-1 transition-opacity duration-300', answered ? 'opacity-100' : 'opacity-0')}>{REPLY}</p>
    </div>
  );
}

const KEYS = ['Ctrl', 'Shift', 'Space'];

/** The quick search shortcut: the three keys go down in turn, hold, and come back up. */
export function ShortcutKeys() {
  const [ref, inView] = useInView<HTMLDivElement>();
  const tick = useTicker(160, inView, 4) % 16;

  return (
    <div ref={ref} aria-hidden="true" className="mt-10 flex items-center gap-2">
      {KEYS.map((k, i) => (
        <span
          key={k}
          className={cn(
            'key inline-flex h-12 min-w-12 items-center justify-center bg-secondary px-4 font-mono text-[12px] tracking-[0.07em] text-secondary-foreground uppercase',
            k === 'Space' && 'min-w-32',
            tick > i && tick < 9 && 'key-down',
          )}
        >
          {k}
        </span>
      ))}
      <span className={cn('cap ml-3 text-primary transition-opacity duration-200', tick >= 4 && tick < 12 ? 'opacity-100' : 'opacity-0')}>
        Quick search
      </span>
    </div>
  );
}
