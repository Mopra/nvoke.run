import { useCallback, useEffect, useRef, useState, type ComponentProps, type ReactNode, type RefObject } from 'react';
import { ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { transportMode } from '@/lib/api';
import { closeWindow } from '@/lib/chrome';
import { formatNumber, isActive, percent, searchTitle } from '@/lib/format';
import { modKey, useModHotkey } from '@/lib/hotkeys';
import { CountUp } from '@/lib/motion';
import { useMe, useSearches } from '@/lib/queries';
import { navigate, routeHref, type Route } from '@/lib/router';
import type { Search } from '@/lib/types';
import { CommandBar } from '@/components/CommandBar';
import { FileDrop } from '@/components/FileDrop';
import { LedMeter, litSegments } from '@/components/SearchProgress';
import { UpdateButton } from '@/components/UpdateButton';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

/**
 * The window is one instrument. Along the top edge sit the ports, the way
 * around; below them the name plate and the speaker grille, which pulses
 * while nvoke works; then the display strip, which carries the running
 * search; then the panel, where the screens live. The window has no native
 * controls: the power nub closes it, the top edge drags it and a double
 * click there maximizes it.
 */
export function AppShell({ route, children }: { route: Route; children: ReactNode }) {
  const { data } = useSearches();
  const live = data?.filter((s) => isActive(s.status)) ?? [];
  const [commandOpen, setCommandOpen] = useState(false);
  useModHotkey('k', () => setCommandOpen((open) => !open));

  return (
    <div className="canvas relative isolate flex h-full flex-col overflow-hidden">
      <Ports route={route} onFind={() => setCommandOpen(true)} />
      <Head live={live} />
      <Display searches={data ?? []} live={live} route={route} onOpen={() => setCommandOpen(true)} />
      <div className="relative flex min-h-0 flex-1 flex-col">{children}</div>
      <CommandBar open={commandOpen} onOpenChange={setCommandOpen} />
      <FileDrop />
    </div>
  );
}

/** Ambient orange light at the top of a screen. Present only while nvoke works, where a screen asks for it. */
export function Aura({ on }: { on: boolean }) {
  return (
    <div
      aria-hidden
      className={cn(
        'pointer-events-none absolute -top-[340px] left-1/2 -z-10 h-[520px] w-[900px] -translate-x-1/2 transition-opacity duration-[1600ms] ease-out-soft',
        on ? 'opacity-100' : 'opacity-0',
      )}
    >
      <div className="absolute inset-0 rounded-full bg-[radial-gradient(closest-side,var(--aura),transparent)] motion-safe:animate-breathe" />
      <div className="absolute inset-x-[20%] top-[30%] bottom-0 rounded-full bg-[radial-gradient(closest-side,var(--aura-soft),transparent)]" />
    </div>
  );
}

/* The ports */

const PORT =
  'inline-flex h-[34px] min-w-[86px] items-center justify-center gap-1.5 self-start rounded-b-[5px] px-3.5 cap outline-none transition-[filter,transform] duration-100 hover:brightness-[1.06] active:translate-y-px focus-visible:ring-2 focus-visible:ring-ring/60';
const PORT_TONE = {
  dark: 'bg-foreground text-background',
  light: 'bg-secondary text-secondary-foreground shadow-[0_1px_0_var(--glass-edge)]',
  grey: 'bg-muted-foreground text-background',
} as const;

function Port({
  href,
  current = false,
  tone,
  onClick,
  children,
  className,
}: {
  href?: string;
  current?: boolean;
  tone: keyof typeof PORT_TONE;
  onClick?: () => void;
  children: ReactNode;
  className?: string;
}) {
  const classes = cn(PORT, current ? 'bg-primary text-primary-foreground' : PORT_TONE[tone], className);
  if (href) {
    return (
      <a href={href} aria-current={current ? 'page' : undefined} className={classes}>
        {children}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} className={classes}>
      {children}
    </button>
  );
}

/** A port's notch: the small dot on the New and Find labels. */
function Notch() {
  return <span aria-hidden className="size-[3px] rounded-full bg-current opacity-70" />;
}

/**
 * The top edge: the ports are the way around, labelled like the sockets on a
 * sampler. The lit one is where you are. The row is the window's drag handle,
 * with room for the caption buttons on Windows and Linux and the traffic
 * lights on macOS.
 */
function Ports({ route, onFind }: { route: Route; onFind: () => void }) {
  const onSearch = route.name === 'search';
  return (
    <header className="app-drag rim relative z-20 flex h-(--titlebar-height) shrink-0 items-start gap-2.5 pr-7 pl-5">
      <Port href={routeHref({ name: 'searches' })} current={route.name === 'searches'} tone="dark">
        Searches
      </Port>
      <Port href={routeHref({ name: 'new', kind: null })} current={route.name === 'new' || route.name === 'website'} tone="light">
        <Notch />
        New
      </Port>
      {onSearch && (
        <Port href={window.location.hash} current tone="dark">
          Results
        </Port>
      )}
      <Port href={routeHref({ name: 'drops' })} current={route.name === 'drops' || route.name === 'drop'} tone="grey">
        Drops
      </Port>
      <div className="ml-auto flex items-start gap-2.5">
        <UpdateButton />
        <Tooltip>
          <TooltipTrigger asChild>
            <Port tone="dark" onClick={onFind} className="min-w-0">
              Find
              <Notch />
              {modKey} K
            </Port>
          </TooltipTrigger>
          <TooltipContent>Search or jump to anything</TooltipContent>
        </Tooltip>
        <Port href={routeHref({ name: 'account' })} current={route.name === 'account'} tone="grey">
          Account
        </Port>
        <Power />
      </div>
    </header>
  );
}

/** The power nub is the window's only control: it closes the window, and nvoke stays in the tray. */
function Power() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={closeWindow}
          aria-label="Close window"
          className="group flex flex-col items-center gap-1 rounded-b-[4px] px-1.5 outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
        >
          <span className="h-2 w-4 rounded-b-[2px] bg-primary shadow-[0_0_6px_var(--primary)] transition-[transform,filter] duration-100 group-hover:brightness-110 group-active:translate-y-px group-active:brightness-90" />
          <span className="cap text-muted-foreground">Power</span>
        </button>
      </TooltipTrigger>
      <TooltipContent>Close. nvoke stays in the tray.</TooltipContent>
    </Tooltip>
  );
}

/* The head: name plate and grille */

/** The name plate on the left, the speaker grille on the right. */
function Head({ live }: { live: Search[] }) {
  return (
    <div className="app-drag grid shrink-0 grid-cols-[1fr_232px] px-3.5">
      <Plate />
      <Grille live={live} />
    </div>
  );
}

function Plate() {
  const { data } = useMe();
  const left = data ? Math.max(0, data.usage.emailsLimit - data.usage.emailsVerified) : null;
  return (
    <div className="grid grid-cols-[1fr_auto] grid-rows-[1fr_auto] gap-x-7 rounded-tl-[3px] border border-glass-edge bg-card px-5 pt-3.5 pb-3 text-card-foreground">
      <div>
        <div className="font-display text-[30px] leading-none font-light tracking-[-0.01em]">
          nvoke
        </div>
        <div className="cap mt-2 text-primary">Find &#183; Crawl &#183; Verify</div>
      </div>
      <dl className="grid grid-cols-[auto_auto] content-start justify-self-end gap-x-3.5 gap-y-0.5 text-right">
        <dt className="cap text-muted-foreground">Plan</dt>
        <dd className="font-mono text-[11px] font-medium tabular-nums">{data ? formatNumber(data.usage.emailsLimit) : ''}</dd>
        <dt className="cap text-muted-foreground">Used</dt>
        <dd className="font-mono text-[11px] font-medium tabular-nums">{data ? formatNumber(data.usage.emailsVerified) : ''}</dd>
        <dt className="cap text-muted-foreground">Left</dt>
        <dd className="font-mono text-[11px] font-medium tabular-nums text-primary">{left === null ? '' : formatNumber(left)}</dd>
      </dl>
      <div className="col-span-2 flex items-baseline justify-between self-end">
        <span className="text-[13px] tracking-[0.02em] uppercase">Verified email lead finder</span>
        <span className="cap text-muted-foreground">NV-1{transportMode === 'mock' && ' · Demo'}</span>
      </div>
    </div>
  );
}

const GRILLE_COLS = 16;
const GRILLE_ROWS = 6;

/**
 * The speaker grille is a level meter of lead flow. Each column is one poll
 * of the running searches (every two seconds, so the grille holds the last
 * half minute) and its height is how many emails came in on that poll. A
 * running search that finds nothing idles at one dot; at rest the grille
 * goes dark.
 */
function Grille({ live }: { live: Search[] }) {
  const working = live.length > 0;
  const found = live.reduce((n, s) => n + s.emailsFound, 0);
  // The history of columns, derived from each new poll's figure as it arrives.
  const [meter, setMeter] = useState<{ found: number | null; bars: number[] }>({ found: null, bars: [] });
  if (!working && meter.found !== null) {
    setMeter({ found: null, bars: [] });
  } else if (working && meter.found !== found) {
    // The first poll sets the baseline; every later one adds a column.
    const delta = meter.found === null ? 0 : Math.max(0, found - meter.found);
    const bar = Math.min(GRILLE_ROWS, delta === 0 ? 1 : 1 + Math.ceil(Math.log2(delta + 1)));
    setMeter({ found, bars: [...meter.bars.slice(-(GRILLE_COLS - 1)), bar] });
  }
  const bars = meter.bars;
  const heights = Array.from({ length: GRILLE_COLS }, (_, col) => bars[col - (GRILLE_COLS - bars.length)] ?? 0);
  return (
    <div
      aria-hidden
      className="grid gap-1 rounded-tr-[3px] bg-muted-foreground/35 p-3"
      style={{ gridTemplateColumns: `repeat(${GRILLE_COLS}, 1fr)`, gridTemplateRows: `repeat(${GRILLE_ROWS}, 1fr)` }}
    >
      {Array.from({ length: GRILLE_COLS * GRILLE_ROWS }, (_, i) => {
        const col = i % GRILLE_COLS;
        const row = Math.floor(i / GRILLE_COLS);
        const lit = GRILLE_ROWS - row <= (heights[col] ?? 0);
        return (
          <span
            key={i}
            className={cn(
              'rounded-full transition-[background-color,box-shadow] duration-200',
              lit ? 'bg-primary shadow-[0_0_5px_var(--primary)]' : 'bg-foreground/80',
            )}
          />
        );
      })}
    </div>
  );
}

/* The display */

/** The eight small blocks on the left of the display: one per search, lit by its state. */
function Blocks({ searches, shown }: { searches: Search[]; shown: Search | undefined }) {
  return (
    <span aria-hidden className="flex items-center gap-1.5">
      {Array.from({ length: 8 }, (_, i) => {
        const s = searches[i];
        return (
          <span
            key={i}
            className={cn(
              'h-3.5 rounded-[2px] bg-screen-dim',
              i % 4 === 3 ? 'w-7' : 'w-3.5',
              s?.status === 'running' && 'bg-primary shadow-[0_0_8px_var(--primary)]',
              s?.status === 'queued' && 'bg-chart-3 shadow-[0_0_8px_var(--chart-3)]',
              // The one the display is reading right now.
              s && s.id === shown?.id && 'ring-1 ring-screen-foreground/70 ring-offset-1 ring-offset-screen',
            )}
          />
        );
      })}
    </span>
  );
}

/** Which of several running searches the display reads: each gets a few seconds in turn. */
function useTurn(count: number, ms = 4000): number {
  const [turn, setTurn] = useState(0);
  useEffect(() => {
    if (count < 2) return;
    const id = setInterval(() => setTurn((t) => t + 1), ms);
    return () => clearInterval(id);
  }, [count, ms]);
  return count ? turn % count : 0;
}

/**
 * The display strip. While a search runs it shows that search and its
 * verified count; at rest it reads the month's figure. Pressing it opens the
 * command bar, so it is also the way to find a lead or jump anywhere.
 */
function Display({ searches, live, route, onOpen }: { searches: Search[]; live: Search[]; route: Route; onOpen: () => void }) {
  const { data: me } = useMe();
  // Several running searches take turns on the display.
  const turn = useTurn(live.length);
  const current = live[turn];
  // On the running search's own page, the page already shows the progress.
  const showLive = current && !(route.name === 'search' && route.id === current.id);
  const scale = current ? Math.max(current.limit, current.companiesFound, 1) : 1;
  const done = current ? percent(current.companiesCrawled, scale) : 0;

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="Search or jump to"
      className="screen app-no-drag relative mx-3.5 grid h-[62px] shrink-0 grid-cols-[auto_1fr_auto] items-center gap-5 overflow-hidden rounded-none rounded-b-[3px] px-5 text-left outline-none transition-[filter] duration-150 hover:brightness-110 focus-visible:ring-2 focus-visible:ring-ring/60"
    >
      <span aria-hidden className="pointer-events-none absolute inset-0 bg-[linear-gradient(100deg,transparent_40%,oklch(1_0_0/0.05)_55%,transparent_70%)]" />
      <Blocks searches={searches} shown={showLive ? current : undefined} />
      {showLive ? (
        <span key={current.id} className="flex min-w-0 items-center gap-3 motion-safe:animate-fade-in">
          <span className="led led-on motion-safe:animate-pulse" />
          <span className="lcd min-w-0 truncate text-[17px] uppercase" title={searchTitle(current)}>
            {searchTitle(current)}
          </span>
          {current.stageNote ? (
            <span data-island-stage className="cap hidden min-w-0 truncate text-screen-foreground/50 min-[1100px]:inline" title={current.stageNote}>
              {current.stageNote}
            </span>
          ) : (
            <LedMeter lit={litSegments(Math.max(done, 4))} className="w-20 shrink-0" />
          )}
        </span>
      ) : (
        <span className="flex min-w-0 items-center gap-3">
          <span className="lcd text-[17px] uppercase">{current ? 'Working' : 'Ready'}</span>
          <span className="cap text-screen-foreground/50">Find a lead, or jump to</span>
          <Kbd className="bg-screen-dim/60 text-screen-foreground/60">{modKey} K</Kbd>
        </span>
      )}
      <span className="flex items-baseline gap-3">
        <span className={cn('cap', current ? 'text-primary' : 'text-screen-foreground/40')}>Run</span>
        <span className={cn('cap', current ? 'text-screen-foreground/40' : 'text-primary')}>Done</span>
        <span className="relative ml-1 inline-block min-w-[3ch] text-right font-lcd text-[30px] leading-none">
          <span aria-hidden className="absolute inset-y-0 right-0 font-extrabold text-screen-dim">
            888
          </span>
          <span className="lcd relative tabular-nums">
            {current ? <CountUp value={current.emailsValid} /> : me ? formatNumber(me.usage.emailsVerified) : '0'}
          </span>
        </span>
        <span className="cap text-screen-foreground/50">{current ? 'Verified' : 'This month'}</span>
        {live.length > 1 && (
          <span className="cap text-screen-foreground/50">
            {turn + 1} / {live.length}
          </span>
        )}
      </span>
    </button>
  );
}

/* Pieces the screens use */

/** Back to the searches list, for every screen below it. */
export function BackButton() {
  return (
    <Button variant="secondary" size="sm" aria-label="Back to searches" onClick={() => navigate({ name: 'searches' })}>
      <ChevronLeft className="size-3.5" />
      Back
    </Button>
  );
}

/**
 * A screen's top row: the way back on the left, its own keys on the right.
 * Renders nothing when a screen has neither. The ports above carry the
 * global ways around, so New search needs no key here.
 */
export function PageHeader({ leading, actions }: { leading?: ReactNode; actions?: ReactNode; newSearch?: boolean }) {
  if (!leading && !actions) return null;
  return (
    <div className="relative z-20 flex shrink-0 items-center gap-2 px-9 pt-5">
      {leading}
      <div className="ml-auto flex shrink-0 items-center gap-2">{actions}</div>
    </div>
  );
}

/** A screen's display title: large, light, with its figure as a label in orange. */
export function DisplayTitle({
  children,
  subtitle,
  className,
}: {
  children: ReactNode;
  subtitle?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('pt-8 pb-8', className)}>
      <h1 className="font-display text-4xl font-light tracking-[-0.02em] text-balance">{children}</h1>
      {subtitle && <p className="cap mt-3 text-primary">{subtitle}</p>}
    </div>
  );
}

/**
 * A group of keys under a bracket that names what they do, like the BPM and
 * METRONOME brackets on a sampler.
 */
export function KeyGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="relative flex items-end gap-2.5 pt-4">
      <span aria-hidden className="pointer-events-none absolute inset-x-1 top-[5px] h-1.5 border border-b-0 border-muted-foreground/70" />
      <span className="cap absolute top-0 left-1/2 -translate-x-1/2 bg-background px-1.5 text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

/** A key with its LED above it, lit when the key is the one to press. */
export function LedKey({ on = false, children }: { on?: boolean; children: ReactNode }) {
  return (
    <div className="relative pt-2.5">
      <span aria-hidden className={cn('led absolute top-0 left-1/2 -translate-x-1/2', on && 'led-on')} />
      {children}
    </div>
  );
}

/**
 * The chassis darkens at the foot of a panel that scrolls, so the rows run
 * out under the edge instead of stopping at it. Shown only while there is
 * more below.
 */
export function ScrollShade({ of }: { of: RefObject<HTMLElement | null> }) {
  const [more, setMore] = useState(false);
  useEffect(() => {
    const el = of.current;
    if (!el) return;
    const check = (): void => setMore(el.scrollHeight - el.clientHeight - el.scrollTop > 8);
    const id = requestAnimationFrame(check);
    el.addEventListener('scroll', check, { passive: true });
    const observer = new ResizeObserver(check);
    observer.observe(el);
    const content = new MutationObserver(check);
    content.observe(el, { childList: true, subtree: true });
    return () => {
      cancelAnimationFrame(id);
      el.removeEventListener('scroll', check);
      observer.disconnect();
      content.disconnect();
    };
  }, [of]);
  return (
    <div
      aria-hidden
      className={cn(
        'pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-[linear-gradient(to_bottom,transparent,var(--shade-foot))] transition-opacity duration-300',
        more ? 'opacity-100' : 'opacity-0',
      )}
    />
  );
}

/**
 * A screen's scrolling panel: the main element with the shade at its foot.
 * Takes a ref like a plain main, for screens that scroll it themselves.
 */
export function Panel({ ref, className, children, ...props }: ComponentProps<'main'>) {
  const el = useRef<HTMLElement | null>(null);
  const setRef = useCallback(
    (node: HTMLElement | null) => {
      el.current = node;
      if (typeof ref === 'function') ref(node);
      else if (ref) ref.current = node;
    },
    [ref],
  );
  return (
    <>
      <main ref={setRef} className={cn('min-h-0 flex-1 overflow-auto', className)} {...props}>
        {children}
      </main>
      <ScrollShade of={el} />
    </>
  );
}
