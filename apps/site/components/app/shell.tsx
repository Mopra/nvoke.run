'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowUpRight, ChevronLeft } from 'lucide-react';
import { LedMeter, litSegments } from '@/components/app/search-progress';
import { LogoMark, Wordmark } from '@/components/site/logo';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { formatNumber, isActive, percent, searchTitle } from '@/lib/app/desktop';
import { BILLING_PATH, quotaState } from '@/lib/app/quota';
import { useMe, useSearches } from '@/lib/app/queries';
import { cn } from '@/lib/utils';

/**
 * The web app on the site's paper: a slim header with the mark, the screens
 * as printed links (the open one lit by an LED and an orange rule), the
 * running search and the month's figures on a small black display. The
 * screens sit below it, unboxed. `data-app` switches to the desktop type scale.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div data-app className="relative isolate flex min-h-dvh flex-col bg-background text-foreground">
      <Header />
      <QuotaNotice />
      <div className="flex flex-1 flex-col">{children}</div>
      <PageShade />
    </div>
  );
}

/**
 * One frame for the header and every screen, so all edges line up. Every
 * screen fills it. `APP_INSET` is the text inset inside the frame, matching
 * the list rows and the first link.
 */
export const APP_FRAME = 'mx-auto w-full max-w-6xl px-4 sm:px-6';
export const APP_INSET = 'sm:px-3';

/* The header */

/** A screen's link: mono capitals, an LED and an orange rule under it when it is the open one. */
function NavLink({ href, current = false, children, label }: { href: string; current?: boolean; children: ReactNode; label?: string }) {
  return (
    <Link
      href={href}
      aria-label={label}
      aria-current={current ? 'page' : undefined}
      className={cn(
        'cap relative flex h-14 shrink-0 items-center gap-2 px-1 outline-none transition-colors focus-visible:text-foreground sm:px-2',
        current ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      <span aria-hidden className={cn('led transition-colors max-sm:hidden', current ? 'led-on' : 'bg-transparent')} />
      {children}
      <span
        aria-hidden
        className={cn(
          'absolute inset-x-1 -bottom-px h-0.5 origin-left bg-primary transition-transform duration-300 ease-out-soft',
          current ? 'scale-x-100' : 'scale-x-0',
        )}
      />
    </Link>
  );
}

/**
 * The top edge: the mark and wordmark, the screens, a running search when
 * its page is not open, and the month on a display. Results shows only on a
 * search's page.
 */
function Header() {
  const path = usePathname() ?? '/app';
  const onSearches = path === '/app' || path === '/app/';
  const result = path.match(/^\/app\/searches\/([^/]+)/);
  const onNew = path.startsWith('/app/new') || path.startsWith('/app/website');
  const onAccount = path.startsWith('/app/account') || path.startsWith(BILLING_PATH);
  return (
    <header className="sticky top-0 z-40 border-b bg-background">
      <nav aria-label="App" className={cn(APP_FRAME, 'flex h-14 items-center gap-2 sm:gap-5')}>
        <Link
          href="/app"
          aria-label="nvoke searches"
          className="mr-1 flex shrink-0 items-center gap-2.5 rounded-[6px] text-[20px] leading-none outline-none focus-visible:ring-2 focus-visible:ring-ring/60 sm:mr-3"
        >
          <LogoMark motion="hover" className="size-[24px]" />
          <Wordmark className="hidden sm:inline" />
        </Link>
        <NavLink href="/app" current={onSearches}>
          Searches
        </NavLink>
        <NavLink href="/app/new" current={onNew} label="New search">
          New
        </NavLink>
        {result && (
          <NavLink href={path} current>
            Results
          </NavLink>
        )}
        <LiveSearch path={path} />
        <div className="ml-auto flex items-center gap-2 sm:gap-5">
          <Readout />
          <NavLink href="/app/account" current={onAccount}>
            Account
          </NavLink>
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
      className="hidden h-7 min-w-0 items-center gap-2.5 rounded-[3px] px-1.5 outline-none hover:bg-foreground/[0.04] focus-visible:ring-2 focus-visible:ring-ring/60 lg:flex"
    >
      <span className="led led-on motion-safe:animate-blink" />
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

/** The month on a small black display: the verified emails left, lit, over the plan. */
function Readout() {
  const { data } = useMe();
  if (!data) return null;
  const limit = data.usage.emailsLimit;
  const left = Math.max(0, limit - data.usage.emailsVerified);
  const lit = String(formatNumber(left));
  const ghost = formatNumber(limit).replace(/\d/g, '8');
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          href={BILLING_PATH}
          aria-label={`${formatNumber(left)} of ${formatNumber(limit)} verified emails left this month`}
          className="screen hidden h-9 items-center gap-2.5 px-3 outline-none transition-[filter] hover:brightness-125 focus-visible:ring-2 focus-visible:ring-ring/60 md:flex"
        >
          <span className={cn('led', left > 0 ? 'led-on' : 'bg-destructive')} />
          <span className="cap text-screen-foreground/50">Left</span>
          <span className="relative text-[17px] leading-none">
            <span aria-hidden className="ghost">
              {ghost}
            </span>
            <span className="lcd absolute inset-y-0 right-0">{lit}</span>
          </span>
        </Link>
      </TooltipTrigger>
      <TooltipContent>
        {formatNumber(data.usage.emailsVerified)} of {formatNumber(limit)} verified emails used this month
      </TooltipContent>
    </Tooltip>
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
    <div className={cn('pt-10 pb-10', className)}>
      <h1 className="font-display text-4xl font-light tracking-[-0.03em] text-balance sm:text-5xl">{children}</h1>
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
