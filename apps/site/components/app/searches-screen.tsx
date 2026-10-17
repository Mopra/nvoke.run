'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Ban, ClipboardList, Globe, MapPin, MoreHorizontal, Rocket, Sparkles, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { Search } from '@nvoke/shared';
import { DeleteSearchDialog } from '@/components/app/delete-search-dialog';
import { StatusDot } from '@/components/app/indicators';
import { progressCaption, SearchProgress } from '@/components/app/search-progress';
import { APP_FRAME, APP_INSET, DisplayTitle } from '@/components/app/shell';
import { ErrorState } from '@/components/app/states';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { errorMessage, formatNumber, isActive, relativeTime, searchSubtitle, searchTitle, STATUS_LABEL } from '@/lib/app/desktop';
import { useCancelSearch, useLatestProfileBuild, useRefreshWhenFinished, useSearches, useSiteProfile } from '@/lib/app/queries';
import { displayDomain, PROFILE_PATH, WEBSITE_PATH } from '@/lib/app/site-profile';
import { cn } from '@/lib/utils';

const href = (search: Search): string => `/app/searches/${search.id}`;

function RowMenu({ search }: { search: Search }) {
  const [confirm, setConfirm] = useState(false);
  const cancel = useCancelSearch();
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Actions for ${searchTitle(search)}`}
            className="pointer-events-auto text-muted-foreground sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100 data-[state=open]:bg-accent data-[state=open]:opacity-100"
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link href={href(search)}>
              <ArrowUpRight />
              Open
            </Link>
          </DropdownMenuItem>
          {isActive(search.status) && (
            <DropdownMenuItem
              onSelect={() =>
                cancel.mutate(search.id, {
                  onSuccess: () => toast('Search stopped', { description: 'Everything found so far is kept.' }),
                  onError: (err) => toast.error('Couldn’t stop the search', { description: err.message }),
                })
              }
            >
              <Ban />
              Stop search
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setConfirm(true)}>
            <Trash2 />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <DeleteSearchDialog search={search} open={confirm} onOpenChange={setConfirm} />
    </>
  );
}

function SearchRow({ search }: { search: Search }) {
  const active = isActive(search.status);
  const stopped = search.status === 'failed' || search.status === 'canceled';
  return (
    <div className="group relative rounded-[24px] transition-colors duration-200 hover:bg-foreground/[0.035] has-[a:focus-visible]:bg-foreground/[0.05]">
      <Link
        href={href(search)}
        data-search-status={search.status}
        aria-label={searchTitle(search)}
        className="absolute inset-0 rounded-[24px] outline-none"
      />
      <div className="pointer-events-none relative flex items-center gap-4 px-4 py-5 sm:gap-8 sm:px-6">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            {(active || search.status === 'failed') && <StatusDot status={search.status} />}
            <span className="truncate font-display text-lg font-medium">{searchTitle(search)}</span>
          </div>
          <div className="mt-1 truncate text-sm text-muted-foreground">
            {stopped || active ? `${STATUS_LABEL[search.status]}, ` : ''}
            {searchSubtitle(search).toLowerCase()}, {relativeTime(search.createdAt)}
          </div>
          {active && (
            <div className="mt-4 flex max-w-md flex-wrap items-center gap-x-4 gap-y-2">
              <SearchProgress search={search} className="h-[3px] min-w-32 flex-1" />
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{progressCaption(search)}</span>
            </div>
          )}
          {search.status === 'failed' && (
            <div className="mt-1 truncate text-xs text-muted-foreground/80">{errorMessage(search.error)}</div>
          )}
        </div>
        <div className="shrink-0 text-right">
          <div className="font-display text-3xl font-light tabular-nums">{formatNumber(search.emailsFound)}</div>
          <div className="text-xs tabular-nums text-muted-foreground">
            {stopped && search.emailsFound === 0 ? 'no emails' : `emails, ${formatNumber(search.emailsValid)} valid`}
          </div>
        </div>
        <div className="pointer-events-auto -mr-2 flex w-7 justify-end">
          <RowMenu search={search} />
        </div>
      </div>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="flex items-center gap-8 px-4 py-6 sm:px-6">
          <div className="flex flex-1 flex-col gap-2.5">
            <Skeleton className="h-4 w-56 max-w-full" />
            <Skeleton className="h-3 w-36" />
          </div>
          <div className="flex flex-col items-end gap-2">
            <Skeleton className="h-7 w-12" />
            <Skeleton className="h-2.5 w-20" />
          </div>
        </div>
      ))}
    </div>
  );
}

function Section({ searches }: { searches: Search[] }) {
  if (searches.length === 0) return null;
  return (
    <section className="flex flex-col gap-1 [&+&]:mt-10">
      {searches.map((s) => (
        <SearchRow key={s.id} search={s} />
      ))}
    </section>
  );
}

const BY_HAND = [
  { kind: 'local', icon: MapPin, title: 'Local businesses' },
  { kind: 'web', icon: Globe, title: 'Web search' },
  { kind: 'domains', icon: ClipboardList, title: 'Paste a list' },
  { kind: 'launches', icon: Rocket, title: 'New launches' },
] as const;

/**
 * The website read sits on the list like a search: running while nvoke reads
 * the site, then planned until the user picks its searches. New search always
 * starts fresh, so this row is the way back to it.
 */
function WebsiteRow() {
  const profile = useSiteProfile();
  const latest = useLatestProfileBuild();
  const reading = latest?.status === 'pending' ? latest.build.domain : null;
  if (!reading && !profile.data) return null;
  const planned = profile.data?.suggestions.length ?? 0;
  const title = reading ?? profile.data!.profile.name;
  return (
    <section className="flex flex-col gap-1 [&+&]:mt-10">
      <div className="group relative rounded-[24px] transition-colors duration-200 hover:bg-foreground/[0.035] has-[a:focus-visible]:bg-foreground/[0.05]">
        <Link href={PROFILE_PATH} aria-label={title} className="absolute inset-0 rounded-[24px] outline-none" />
        <div className="pointer-events-none relative flex items-center gap-4 px-4 py-5 sm:gap-8 sm:px-6">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3">
              {reading && <StatusDot status="running" />}
              <span className={cn('truncate font-display text-lg font-medium', reading && 'font-mono font-normal tracking-tight')}>{title}</span>
            </div>
            <div className="mt-1 truncate text-sm text-muted-foreground">
              {reading
                ? 'Reading your website, planning searches'
                : `Your website, ${displayDomain(profile.data!.website)}, ${relativeTime(profile.data!.updatedAt)}`}
            </div>
            {reading && (
              <div className="mt-4 h-[3px] w-full max-w-md overflow-hidden rounded-full bg-foreground/[0.07]">
                <div className="h-full w-1/4 rounded-full bg-primary motion-safe:animate-indeterminate" />
              </div>
            )}
          </div>
          {!reading && (
            <div className="shrink-0 text-right">
              <div className="font-display text-3xl font-light tabular-nums">{formatNumber(planned)}</div>
              <div className="text-xs tabular-nums text-muted-foreground">{planned === 1 ? 'search planned' : 'searches planned'}</div>
            </div>
          )}
          <div className="-mr-2 w-7" />
        </div>
      </div>
    </section>
  );
}

/** The first visit: one obvious action, the website step, and the search kinds for those who know what they want. */
function FirstSearch() {
  return (
    <section className={cn(APP_INSET, 'pb-10 [section+&]:mt-10')}>
      <p className="max-w-lg text-base text-pretty text-muted-foreground">
        Give nvoke your website. It works out who buys from you and plans the searches that find them. Then it reads each
        company’s own site and checks every email with the mail server. Only verified emails count toward your plan.
      </p>
      <div className="mt-8">
        <Button asChild size="lg">
          <Link href={WEBSITE_PATH}>
            <Sparkles />
            Start from your website
          </Link>
        </Button>
      </div>
      <nav aria-label="Set up a search by hand" className="mt-12 flex flex-wrap items-center gap-x-1 gap-y-2 text-sm">
        <span className="mr-2 text-muted-foreground">Or by hand:</span>
        {BY_HAND.map(({ kind, icon: Icon, title }) => (
          <Link
            key={kind}
            href={`/app/new?kind=${kind}`}
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-foreground/75 outline-none transition-colors hover:bg-foreground/[0.05] hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40"
          >
            <Icon className="size-3.5 text-muted-foreground" />
            {title}
          </Link>
        ))}
      </nav>
    </section>
  );
}

export function SearchesScreen() {
  const { data, error, isPending, refetch } = useSearches();
  const active = data?.filter((s) => isActive(s.status)) ?? [];
  const earlier = data?.filter((s) => !isActive(s.status)) ?? [];

  // The list is polled; the account needs a refresh when the last search ends.
  useRefreshWhenFinished(active.length > 0, null);

  const subtitle = !data
    ? 'Loading'
    : data.length > 0
      ? [`${data.length} ${data.length === 1 ? 'search' : 'searches'}`, active.length ? `${active.length} running` : null]
          .filter(Boolean)
          .join(', ')
      : 'Start your first one. Results show up here as nvoke finds them.';

  return (
    <main className={cn(APP_FRAME, 'pb-24')}>
      <div className="motion-safe:animate-rise">
        <DisplayTitle className={APP_INSET} subtitle={subtitle}>
          Searches
        </DisplayTitle>
        {isPending ? (
          <ListSkeleton />
        ) : error ? (
          <ErrorState error={error} onRetry={() => void refetch()} />
        ) : data.length === 0 ? (
          <>
            <WebsiteRow />
            <FirstSearch />
          </>
        ) : (
          <>
            <WebsiteRow />
            <Section searches={active} />
            <Section searches={earlier} />
          </>
        )}
      </div>
    </main>
  );
}
