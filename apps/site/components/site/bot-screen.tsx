'use client';

import { Figure, Readout } from '@/components/mockups/parts';
import { useInView, useTicker } from '@/components/site/home/motion';
import { site } from '@/lib/site';
import { cn } from '@/lib/utils';

type Line = { path: string; status: string; note?: string; skipped?: boolean; emails?: number };

/** One visit as nvokebot makes it: robots.txt first, then the contact pages, one request a second. */
const LINES: Line[] = [
  { path: '/robots.txt', status: '200', note: 'Disallow: /team/' },
  { path: '/', status: '200' },
  { path: '/contact', status: '200', emails: 1 },
  { path: '/about', status: '200' },
  { path: '/team/', status: 'SKIP', note: 'robots.txt', skipped: true },
  { path: '/impressum', status: '200', emails: 1 },
];

const HOLD = 4;
const CYCLE = LINES.length + HOLD;

/**
 * The crawler's log on a screen: the user agent it sends, then each request
 * appearing at the pace it really runs, a second apart. The skipped folder
 * shows the robots.txt rule doing its job. Reduced motion shows the whole visit.
 */
export function BotScreen({ className }: { className?: string }) {
  const [ref, inView] = useInView<HTMLDivElement>();
  const tick = useTicker(1000, inView, LINES.length) % CYCLE;
  const shown = Math.min(tick + 1, LINES.length);
  const running = tick < LINES.length - 1;
  const read = LINES.slice(0, shown).filter((l) => !l.skipped && l.path !== '/robots.txt').length;
  const emails = LINES.slice(0, shown).reduce((n, l) => n + (l.emails ?? 0), 0);

  return (
    <div
      ref={ref}
      role="img"
      aria-label="nvokebot's log for one site: it reads robots.txt first, reads the home, contact, about and impressum pages, and skips /team/ because robots.txt disallows it."
      className={cn('screen screen-hero overflow-hidden p-5 sm:p-10', className)}
    >
      <div aria-hidden="true">
        <div className="flex items-center gap-3">
          <span className={cn('led', running ? 'led-on motion-safe:animate-blink' : 'bg-chart-1 shadow-[0_0_6px_var(--chart-1)]')} />
          <span className={cn('cap', running ? 'text-primary' : 'text-screen-foreground/60')}>Crawl</span>
          <span className={cn('cap', running ? 'text-screen-foreground/60' : 'text-primary')}>Done</span>
          <span className="cap ml-auto text-screen-foreground/60">1 req / s</span>
        </div>

        <p className="cap mt-6 truncate text-screen-foreground/60 normal-case tracking-normal">
          User-Agent: {site.botUserAgent}
        </p>

        <ol className="mt-5 flex min-h-[13.5em] flex-col gap-1.5 border-t border-screen-dim pt-5 font-mono text-[12px] leading-[1.6] sm:text-[13.5px]">
          {LINES.map((l, i) => {
            const visible = i < shown;
            const current = i === shown - 1 && running;
            return (
              <li
                key={l.path}
                className={cn(
                  'grid grid-cols-[2.5rem_1fr_auto] gap-3 transition-opacity duration-300 motion-reduce:transition-none sm:grid-cols-[3rem_1fr_auto]',
                  visible ? 'opacity-100' : 'opacity-0',
                )}
              >
                <span className={cn(l.skipped ? 'text-screen-foreground/60' : 'text-screen-foreground/80')}>GET</span>
                <span className={cn('truncate', l.skipped ? 'text-screen-foreground/60 line-through' : 'text-screen-foreground')}>
                  {l.path}
                  {l.note ? <span className="ml-3 text-screen-foreground/60 no-underline">{l.note}</span> : null}
                </span>
                <span className={cn(current ? 'text-primary' : l.skipped ? 'text-screen-foreground/60' : 'text-chart-1')}>
                  {l.emails ? `+${l.emails} ` : ''}
                  {l.status}
                </span>
              </li>
            );
          })}
        </ol>

        <div className="mt-6 grid grid-cols-2 gap-3 border-t border-screen-dim pt-5 sm:mt-8 sm:pt-8">
          <Readout label="Pages read, of 8">
            <Figure value={read} ghost="8" className="self-start text-[40px] sm:text-[64px]" />
          </Readout>
          <Readout label="Emails" className="[&>span:first-child]:text-primary">
            <Figure value={emails} ghost="8" className="self-start text-[40px] sm:text-[64px]" />
          </Readout>
        </div>
      </div>
    </div>
  );
}
