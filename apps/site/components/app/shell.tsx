'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowUpRight, ChevronLeft } from 'lucide-react';
import { LedMeter, litSegments } from '@/components/app/search-progress';
import { LogoMark } from '@/components/site/logo';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { formatNumber, isActive, percent, searchTitle } from '@/lib/app/desktop';
import { BILLING_PATH, quotaState } from '@/lib/app/quota';
import { useMe, useSearches } from '@/lib/app/queries';
import { cn } from '@/lib/utils';

/**
 * The web app is the desktop's panel without the chassis: no name plate, no
 * grille, no display strip. A slim header carries the ports as tabs (dark
 * for the screens, light for New, grey for Account, the lit one orange) and
 * the month's figures in printed capitals; the screens sit on the chassis
 * below it. `data-app` switches to the desktop type scale.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div data-app className="relative isolate flex min-h-dvh flex-col bg-background text-foreground">
      <Ports />
      <QuotaNotice />
      <div className="flex flex-1 flex-col">{children}</div>
      <PageShade />
    </div>
  );
}

/**
 * One frame for the header and every screen, so all edges line up. Every
 * screen fills it. `APP_INSET` is the text inset inside the frame, matching
 * the list rows and the first port.
 */
export const APP_FRAME = 'mx-auto w-full max-w-6xl px-4 sm:px-6';
export const APP_INSET = 'sm:px-3';

/* The ports */

const PORT =
  'inline-flex h-[34px] min-w-0 shrink-0 items-center justify-center gap-1.5 self-start rounded-b-[5px] px-3 cap outline-none transition-[filter,transform] duration-100 hover:brightness-[1.06] active:translate-y-px focus-visible:ring-2 focus-visible:ring-ring/60 sm:min-w-[86px] sm:px-3.5';
const PORT_TONE = {
  dark: 'bg-foreground text-background',
  light: 'bg-secondary text-secondary-foreground shadow-[0_1px_0_var(--glass-edge)]',
  grey: 'bg-muted-foreground text-background',
} as const;

function Port({
  href,
  current = false,
  tone,
  children,
  className,
  label,
}: {
  href: string;
  current?: boolean;
  tone: keyof typeof PORT_TONE;
  children: ReactNode;
  className?: string;
  label?: string;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      aria-current={current ? 'page' : undefined}
      className={cn(PORT, current ? 'bg-primary text-primary-foreground' : PORT_TONE[tone], className)}
    >
      {children}
    </Link>
  );
}

/** A port's notch: the small dot on the New label. */
function Notch() {
  return <span aria-hidden className="size-[3px] rounded-full bg-current opacity-70" />;
}

/**
 * The top edge: the ports are the way around, labelled like the sockets on a
 * sampler, hanging from the rim. The lit one is where you are. Results shows
 * only on a search's page, as on the desktop.
 */
function Ports() {
  const path = usePathname() ?? '/app';
  const onSearches = path === '/app' || path === '/app/';
  const result = path.match(/^\/app\/searches\/([^/]+)/);
  const onNew = path.startsWith('/app/new') || path.startsWith('/app/website');
  const onAccount = path.startsWith('/app/account') || path.startsWith(BILLING_PATH);
  return (
    <header className="rim sticky top-0 z-40 shadow-[0_1px_0_var(--border)]">
      <nav aria-label="App" className={cn(APP_FRAME, 'flex h-11 items-start gap-2 sm:gap-2.5')}>
        <Link
          href="/app"
          aria-label="nvoke searches"
          className="mt-[7px] mr-1 hidden shrink-0 items-center gap-2 rounded-[6px] outline-none focus-visible:ring-2 focus-visible:ring-ring/60 sm:flex"
        >
          <LogoMark motion="hover" className="size-[22px]" />
        </Link>
        <Port href="/app" current={onSearches} tone="dark">
          Searches
        </Port>
        <Port href="/app/new" current={onNew} tone="light" label="New search">
          <Notch />
          New
        </Port>
        {result && (
          <Port href={path} current tone="dark">
            Results
          </Port>
        )}
        <LiveSearch path={path} />
        <div className="ml-auto flex items-start gap-3 sm:gap-4">
          <Readout />
          <Port href="/app/account" current={onAccount} tone="grey">
            Account
          </Port>
        </div>
      </nav>
    </header>
  );
}

/**
 * While a search runs and its page is not open, the header names it with a
 * lit LED and its meter: the one line of the desktop's display the web keeps.
 */
function LiveSearch({ path }: { path: string }) {
  const { data } = useSearches();
  const live = data?.filter((s) => isActive(s.status)) ?? [];
  const current = live[0];
  if (!current || path === `/app/searches/${current.id}`) return null;
  const done = percent(current.companiesCrawled, Math.max(current.limit, current.companiesFound, 1));
  return (
    <Link
      href={`/app/searches/${current.id}`}
      className="mt-[7px] hidden h-5 min-w-0 items-center gap-2.5 rounded-[3px] px-1.5 outline-none hover:bg-foreground/[0.04] focus-visible:ring-2 focus-visible:ring-ring/60 lg:flex"
    >
      <span className="led led-on motion-safe:animate-pulse" />
      <span className="cap max-w-48 truncate" title={searchTitle(current)}>
        {searchTitle(current)}
      </span>
      <LedMeter lit={litSegments(Math.max(done, 4))} className="w-16 shrink-0" />
      <span className="cap shrink-0 tabular-nums text-muted-foreground">
        {formatNumber(current.emailsFound)} emails{live.length > 1 && ` · ${live.length - 1} more`}
      </span>
    </Link>
  );
}

/** PLAN, USED and LEFT in printed capitals, the figures from the desktop's name plate. */
function Readout() {
  const { data } = useMe();
  if (!data) return null;
  const left = Math.max(0, data.usage.emailsLimit - data.usage.emailsVerified);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          href={BILLING_PATH}
          aria-label={`${formatNumber(left)} verified emails left this month`}
          className="mt-[9px] hidden items-baseline gap-3 rounded-[3px] outline-none focus-visible:ring-2 focus-visible:ring-ring/60 md:flex"
        >
          <Figure label="Plan" value={formatNumber(data.usage.emailsLimit)} />
          <Figure label="Used" value={formatNumber(data.usage.emailsVerified)} />
          <Figure label="Left" value={formatNumber(left)} lit />
        </Link>
      </TooltipTrigger>
      <TooltipContent>Verified emails this month</TooltipContent>
    </Tooltip>
  );
}

function Figure({ label, value, lit = false }: { label: string; value: string; lit?: boolean }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="cap text-muted-foreground">{label}</span>
      <span className={cn('font-mono text-[11.5px] font-medium tabular-nums', lit && 'text-primary')}>{value}</span>
    </span>
  );
}

/**
 * The upgrade path, shown under the header on every screen once the month's
 * allowance is nearly or fully used. Hidden on the billing page itself.
 */
function QuotaNotice() {
  const path = usePathname();
  const { data } = useMe();
  if (!data || path === BILLING_PATH) return null;
  const quota = quotaState(data);
  if (quota.level === 'ok') return null;
  const out = quota.level === 'out';
  return (
    <div className={cn(APP_FRAME, 'pt-4')}>
      <div
        role={out ? 'alert' : 'status'}
        data-quota={quota.level}
        className={cn(APP_INSET, 'flex w-full flex-wrap items-center gap-x-4 gap-y-2 border-y border-border py-2.5 text-sm')}
      >
        <span className={cn('led', out ? 'bg-destructive' : 'bg-chart-2')} />
        <span className="min-w-0 flex-1">
          {out
            ? `All ${formatNumber(quota.limit)} verified emails for this month are used. Searches stop at the limit until the reset.`
            : `${formatNumber(quota.left)} of ${formatNumber(quota.limit)} verified emails left this month.`}
        </span>
        <Button asChild size="sm" variant={out ? 'dark' : 'secondary'}>
          <Link href={BILLING_PATH}>
            {quota.nextPlan ? 'Upgrade' : 'See plans'}
            <ArrowUpRight className="size-3.5 opacity-70" />
          </Link>
        </Button>
      </div>
    </div>
  );
}

/**
 * The chassis darkens at the foot of the window while the page has more
 * below, so the rows run out under the edge instead of stopping at it.
 */
function PageShade() {
  const [more, setMore] = useState(false);
  useEffect(() => {
    const check = (): void => {
      const el = document.documentElement;
      setMore(el.scrollHeight - window.innerHeight - window.scrollY > 8);
    };
    const id = requestAnimationFrame(check);
    window.addEventListener('scroll', check, { passive: true });
    window.addEventListener('resize', check);
    const observer = new ResizeObserver(check);
    observer.observe(document.body);
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener('scroll', check);
      window.removeEventListener('resize', check);
      observer.disconnect();
    };
  }, []);
  return (
    <div
      aria-hidden
      className={cn(
        'pointer-events-none fixed inset-x-0 bottom-0 z-10 h-24 bg-[linear-gradient(to_bottom,transparent,var(--shade-foot))] transition-opacity duration-300',
        more ? 'opacity-100' : 'opacity-0',
      )}
    />
  );
}

/* Pieces the screens use */

/** The way back, a light keycap: to the searches list unless a screen says otherwise. */
export function BackLink({ href = '/app', label = 'Back' }: { href?: string; label?: string }) {
  return (
    <Button asChild variant="secondary" size="sm" className="self-start">
      <Link href={href} aria-label={label === 'Back' ? 'Back to searches' : `Back to ${label.toLowerCase()}`}>
        <ChevronLeft className="size-3.5" />
        {label}
      </Link>
    </Button>
  );
}

/**
 * A screen's top row: the way back on the left, its own keys on the right.
 * Renders nothing when a screen has neither.
 */
export function PageHeader({ leading, actions, className }: { leading?: ReactNode; actions?: ReactNode; className?: string }) {
  if (!leading && !actions) return null;
  return (
    <div className={cn(APP_INSET, 'relative z-20 flex items-center gap-2 pt-6', className)}>
      {leading}
      <div className="ml-auto flex shrink-0 items-center gap-2">{actions}</div>
    </div>
  );
}

/** A screen's display title: large, light, with its figure as a label in orange. */
export function DisplayTitle({ children, subtitle, className }: { children: ReactNode; subtitle?: ReactNode; className?: string }) {
  return (
    <div className={cn('pt-8 pb-8', className)}>
      <h1 className="font-display text-3xl font-light tracking-[-0.02em] text-balance sm:text-4xl">{children}</h1>
      {subtitle && <p className="cap mt-3 text-primary">{subtitle}</p>}
    </div>
  );
}

/**
 * A group of keys under a bracket that names what they do, like the BPM and
 * METRONOME brackets on a sampler.
 */
export function KeyGroup({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn('relative flex items-end gap-2.5 pt-4', className)}>
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
