'use client';

import { useInView, useTicker } from '@/components/site/home/motion';
import { cn } from '@/lib/utils';

/** Leads the board shows arriving, a domain and its verdict. Made up, like every demo on the site. */
const LEADS: [string, Verdict][] = [
  ['zilkerdental.com', 'VALID'],
  ['bakehouse.pt', 'VALID'],
  ['northwind.studio', 'VALID'],
  ['harborlaw.co.uk', 'RISKY'],
  ['fieldnotes.app', 'VALID'],
  ['copperpot.de', 'VALID'],
  ['oakandiron.com', 'CATCH'],
  ['lumenhr.io', 'VALID'],
  ['brightlane.co', 'VALID'],
  ['saltandsail.dk', 'VALID'],
  ['ridgeline.ca', 'RISKY'],
  ['parcelpost.nl', 'VALID'],
];

type Verdict = 'VALID' | 'RISKY' | 'CATCH';

const TONE: Record<Verdict, string> = {
  VALID: 'text-chart-1',
  RISKY: 'text-chart-2',
  CATCH: 'text-chart-3',
};

const ROWS = 6;
const EVERY = 46;
const DOMAIN = 17;
const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.-';

/** A deterministic scramble, so the server and the first client render agree. */
function noise(n: number): number {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

function timeOf(k: number): string {
  const minutes = 7 * 60 + 12 + k * 3 + Math.floor(noise(k) * 3);
  return `${String(Math.floor(minutes / 60) % 24).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

/** One row's characters at a tick: each tile flips through the alphabet, then lands, left to right. */
function flipped(text: string, born: number, tick: number, seed: number): string[] {
  return [...text].map((ch, i) => {
    const settle = born + 4 + i * 1.4 + noise(seed * 31 + i) * 6;
    if (tick >= settle || ch === ' ') return ch;
    return GLYPHS[Math.floor(noise(seed * 97 + i * 13 + tick) * GLYPHS.length)]!;
  });
}

function Tiles({ chars, className }: { chars: string[]; className?: string }) {
  return (
    <span className={cn('flex gap-[0.12em]', className)}>
      {chars.map((ch, i) => (
        <span
          key={i}
          className="relative inline-flex h-[1.55em] w-[1.02em] items-center justify-center rounded-[2px] bg-screen-foreground/[0.07] leading-none"
        >
          {ch === ' ' ? ' ' : ch}
          <span aria-hidden className="absolute inset-x-0 top-1/2 h-px bg-screen" />
        </span>
      ))}
    </span>
  );
}

/**
 * Sign in's board: a split-flap arrivals board where leads come in as rows,
 * each letter flipping through the alphabet before it lands on the domain
 * and its verdict. A new row arrives every few seconds at the top.
 */
export function ArrivalsBoard({ className }: { className?: string }) {
  const [ref, inView] = useInView<HTMLDivElement>('0px');
  const tick = useTicker(55, inView, EVERY * ROWS + 40) + EVERY * ROWS;
  const newest = Math.floor(tick / EVERY);

  return (
    <div
      ref={ref}
      role="img"
      aria-label="An arrivals board of new leads: each company's domain and whether its email verified."
      className={cn('screen screen-hero p-5 sm:p-8', className)}
      style={{ containerType: 'inline-size' }}
    >
      <div aria-hidden="true" className="font-mono font-semibold uppercase" style={{ fontSize: 'min(16px, calc(100cqi / 35))' }}>
        <div className="mb-5 flex items-center gap-3">
          <span className="led led-on motion-safe:animate-blink" />
          <span className="cap text-screen-foreground">Arrivals</span>
          <span className="cap ml-auto text-screen-foreground/45">New leads</span>
        </div>
        <div className="cap mb-3 grid grid-cols-[auto_1fr_auto] gap-[1em] text-screen-foreground/40">
          <span className="w-[5.6em]">Time</span>
          <span>Company</span>
          <span className="w-[5.6em]">Status</span>
        </div>
        <ul className="flex flex-col gap-[0.55em]">
          {Array.from({ length: ROWS }, (_, j) => {
            const k = newest - j;
            const [domain, verdict] = LEADS[((k % LEADS.length) + LEADS.length) % LEADS.length]!;
            const born = k * EVERY;
            const fresh = tick - born < 30;
            return (
              <li key={k} className="grid grid-cols-[auto_1fr_auto] items-center gap-[1em] text-screen-foreground">
                <Tiles chars={flipped(timeOf(k), born, tick, k)} className={cn(fresh && 'text-primary')} />
                <Tiles chars={flipped(domain.toUpperCase().padEnd(DOMAIN, ' ').slice(0, DOMAIN), born, tick, k + 7)} />
                <Tiles chars={flipped(verdict, born + 18, tick, k + 13)} className={TONE[verdict]} />
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
