'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowUpRight, ChevronLeft, Plus } from 'lucide-react';
import { Avatar } from '@/components/app/avatar';
import { LogoMark } from '@/components/site/logo';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { formatNumber, isActive, percent, searchTitle } from '@/lib/app/desktop';
import { BILLING_PATH, quotaState } from '@/lib/app/quota';
import { useMe, useSearches } from '@/lib/app/queries';
import { cn } from '@/lib/utils';

/**
 * The web app's frame, after the desktop window: one calm canvas, a floating
 * glass bar at the top, and the aura (ambient iris light) that rises only
 * while a search runs. `data-app` switches to the desktop type scale.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const { data } = useSearches();
  const live = data?.filter((s) => isActive(s.status)) ?? [];
  return (
    <div data-app className="relative isolate flex min-h-dvh flex-col">
      <Aura on={live.length > 0} />
      <TopBar />
      <QuotaNotice />
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  );
}

function Aura({ on }: { on: boolean }) {
  return (
    <div
      aria-hidden
      className={cn(
        'pointer-events-none fixed -top-[340px] left-1/2 -z-10 h-[520px] w-[900px] max-w-[160vw] -translate-x-1/2 transition-opacity duration-[1600ms] ease-out-soft',
        on ? 'opacity-100' : 'opacity-0',
      )}
    >
      <div className="absolute inset-0 rounded-full bg-[radial-gradient(closest-side,var(--aura),transparent)] motion-safe:animate-breathe" />
      <div className="absolute inset-x-[20%] top-[30%] bottom-0 rounded-full bg-[radial-gradient(closest-side,var(--aura-soft),transparent)]" />
    </div>
  );
}

const navLink =
  'rounded-full px-3 py-1.5 text-[13px] text-foreground/65 outline-none transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40 aria-[current=page]:bg-foreground/[0.06] aria-[current=page]:text-foreground';

/**
 * One frame for the bar and every screen, the same box as the site's
 * Container, so all edges line up. Every screen fills it. `APP_INSET` is the
 * text inset inside the frame, matching the list rows and the bar's logo.
 */
export const APP_FRAME = 'mx-auto w-full max-w-6xl px-4 sm:px-6';
export const APP_INSET = 'px-4 sm:px-6';

function TopBar() {
  const path = usePathname() ?? '/app';
  const onSearches = path === '/app' || path.startsWith('/app/searches');
  return (
    <header className={cn(APP_FRAME, 'pointer-events-none sticky top-0 z-40 pt-4')}>
      <nav
        aria-label="App"
        className="glass pointer-events-auto flex h-12 w-full items-center gap-1 rounded-full pr-1.5 pl-4 sm:pl-6"
      >
        <Link
          href="/app"
          aria-label="nvoke searches"
          className="mr-1 flex items-center gap-2 rounded-full pr-1 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
        >
          <LogoMark className="size-[22px]" />
          <span className="hidden text-[15px] font-semibold tracking-[-0.02em] sm:inline">nvoke</span>
        </Link>
        <Link href="/app" className={navLink} aria-current={onSearches ? 'page' : undefined}>
          Searches
        </Link>
        <Link href="/app/account" className={navLink} aria-current={path.startsWith('/app/account') ? 'page' : undefined}>
          Account
        </Link>
        <LiveSearch hide={path} />
        <div className="ml-auto flex items-center gap-1.5">
          {path !== '/app/new' && (
            <Button asChild size="sm" className="h-9 px-3 sm:px-4">
              <Link href="/app/new" aria-label="New search">
                <Plus className="size-4" strokeWidth={2.25} />
                <span className="hidden sm:inline">New search</span>
              </Link>
            </Button>
          )}
          <AccountButton />
        </div>
      </nav>
    </header>
  );
}

/** While a search runs, the bar carries its progress, like the desktop island. */
function LiveSearch({ hide }: { hide: string }) {
  const { data } = useSearches();
  const live = data?.filter((s) => isActive(s.status)) ?? [];
  const current = live[0];
  if (!current || hide === `/app/searches/${current.id}`) return null;
  const done = percent(current.companiesCrawled, Math.max(current.limit, current.companiesFound, 1));
  return (
    <Link
      href={`/app/searches/${current.id}`}
      className="ml-2 hidden min-w-0 items-center gap-2.5 rounded-full px-2 py-1 text-xs outline-none hover:bg-foreground/[0.04] focus-visible:ring-[3px] focus-visible:ring-ring/40 md:flex"
    >
      <span className="relative flex size-2 shrink-0">
        <span className="absolute inset-0 rounded-full bg-primary opacity-60 motion-safe:animate-ping" />
        <span className="relative size-2 rounded-full bg-primary" />
      </span>
      <span className="max-w-40 truncate font-medium">{searchTitle(current)}</span>
      <span className="h-[3px] w-12 shrink-0 overflow-hidden rounded-full bg-foreground/10">
        <span
          className="block h-full rounded-full bg-primary transition-[width] duration-700 ease-out-soft"
          style={{ width: `${Math.max(done, 4)}%` }}
        />
      </span>
      <span className="shrink-0 tabular-nums text-muted-foreground">
        {formatNumber(current.emailsFound)} emails{live.length > 1 && `, ${live.length - 1} more`}
      </span>
    </Link>
  );
}

/** The ring around the avatar: verified emails used this month. */
function UsageRing({ used, children }: { used: number; children: ReactNode }) {
  const r = 17;
  const c = 2 * Math.PI * r;
  return (
    <span className="relative inline-flex size-[38px] items-center justify-center">
      <svg viewBox="0 0 38 38" className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx="19" cy="19" r={r} fill="none" strokeWidth="1.5" className="stroke-foreground/10" />
        <circle
          cx="19"
          cy="19"
          r={r}
          fill="none"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.min(used, 100) / 100)}
          className={cn('transition-[stroke-dashoffset] duration-1000 ease-out-soft', used >= 90 ? 'stroke-destructive' : 'stroke-primary')}
        />
      </svg>
      {children}
    </span>
  );
}

function AccountButton() {
  const { data } = useMe();
  if (!data) return <span className="size-[38px]" />;
  const used = percent(data.usage.emailsVerified, data.usage.emailsLimit);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          href="/app/account"
          aria-label="Account"
          className="rounded-full outline-none transition-transform duration-200 active:scale-95 focus-visible:ring-[3px] focus-visible:ring-ring/40"
        >
          <UsageRing used={used}>
            <Avatar user={data.user} className="size-7" />
          </UsageRing>
        </Link>
      </TooltipTrigger>
      <TooltipContent>
        {formatNumber(data.usage.emailsVerified)} of {formatNumber(data.usage.emailsLimit)} verified this month
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * The upgrade path, shown under the bar on every screen once the month's
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
    <div className={cn(APP_FRAME, 'pt-3')}>
      <div
        role={out ? 'alert' : 'status'}
        data-quota={quota.level}
        className={cn(
          'flex w-full flex-wrap items-center gap-x-4 gap-y-2 rounded-[20px] px-4 py-3 text-sm sm:px-6',
          out ? 'bg-destructive/8' : 'bg-primary/[0.07]',
        )}
      >
        <span className="min-w-0 flex-1">
          {out
            ? `All ${formatNumber(quota.limit)} verified emails for this month are used. Searches stop at the limit until the reset.`
            : `${formatNumber(quota.left)} of ${formatNumber(quota.limit)} verified emails left this month.`}
        </span>
        <Button asChild size="sm" variant={out ? 'default' : 'outline'}>
          <Link href={BILLING_PATH}>
            {quota.nextPlan ? 'Upgrade' : 'See plans'}
            <ArrowUpRight className="size-3.5 opacity-70" />
          </Link>
        </Button>
      </div>
    </div>
  );
}

/** Back to the searches list. */
export function BackLink({ href = '/app', label = 'Searches' }: { href?: string; label?: string }) {
  return (
    <Link
      href={href}
      className="-ml-2 inline-flex items-center gap-1 rounded-full py-1 pr-3 pl-1.5 text-sm text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40"
    >
      <ChevronLeft className="size-4" />
      {label}
    </Link>
  );
}

/** A screen's display title: large, tight, set in the display face. */
export function DisplayTitle({ children, subtitle, className }: { children: ReactNode; subtitle?: ReactNode; className?: string }) {
  return (
    <div className={cn('pt-10 pb-8', className)}>
      <h1 className="font-display text-3xl font-semibold tracking-[-0.03em] text-balance sm:text-4xl">{children}</h1>
      {subtitle && <p className="mt-2 text-base text-muted-foreground">{subtitle}</p>}
    </div>
  );
}
