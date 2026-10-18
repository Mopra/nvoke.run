import { useRef, useState, type CSSProperties } from 'react';
import { useMutationState } from '@tanstack/react-query';
import { ArrowRight, ArrowUpRight, Ban, Inbox, MoreHorizontal, Trash2, UsersRound } from 'lucide-react';
import { toast } from 'sonner';
import { DisplayTitle, PageHeader } from '@/components/AppShell';
import { DeleteSearchDialog } from '@/components/DeleteSearchDialog';
import { StatusDot } from '@/components/indicators';
import { progressCaption, SearchProgress } from '@/components/SearchProgress';
import { EmptyState, ErrorState } from '@/components/states';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import {
  errorMessage,
  formatNumber,
  isActive,
  offlineCaption,
  relativeTime,
  searchSubtitle,
  searchTitle,
  STATUS_LABEL,
} from '@/lib/format';
import { BUILD_SITE_PROFILE, useCancelSearch, useLocalStatus, useRefreshWhenFinished, useSearches, useSiteProfile } from '@/lib/queries';
import { parseWebsite } from '@/lib/site-profile';
import { CountUp, useStagger } from '@/lib/motion';
import { navigate, routeHref } from '@/lib/router';
import type { Search } from '@/lib/types';
import { cn } from '@/lib/utils';

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
            className="pointer-events-auto text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:bg-accent data-[state=open]:opacity-100"
            onClick={(e) => e.stopPropagation()}
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
          <DropdownMenuItem onSelect={() => navigate({ name: 'search', id: search.id })}>
            <ArrowUpRight />
            Open
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

function SearchRow({ search, style }: { search: Search; style?: CSSProperties }) {
  const active = isActive(search.status);
  const stopped = search.status === 'failed' || search.status === 'canceled';
  return (
    <div style={style} className="group relative rounded-[24px] transition-colors duration-200 hover:bg-foreground/[0.035] has-[a:focus-visible]:bg-foreground/[0.05]">
      <a
        href={routeHref({ name: 'search', id: search.id })}
        data-search-status={search.status}
        data-search-kind={search.kind}
        aria-label={searchTitle(search)}
        className="absolute inset-0 rounded-[24px] outline-none"
      />
      <div className="pointer-events-none relative flex items-center gap-8 px-6 py-5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            {(active || search.status === 'failed') && <StatusDot status={search.status} />}
            <span className="truncate font-display text-lg font-medium">{searchTitle(search)}</span>
          </div>
          <div className="mt-1 truncate text-sm text-muted-foreground">
            {stopped || active ? `${STATUS_LABEL[search.status]}, ` : ''}
            {searchSubtitle(search).toLowerCase()}, {relativeTime(search.createdAt)}
            {search.ongoing && !active && !stopped && <span className="text-foreground/70">, keeps finding new leads</span>}
          </div>
          {active && (
            <div className="mt-4 flex max-w-md items-center gap-4">
              <SearchProgress search={search} className="h-[3px] flex-1" />
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{progressCaption(search)}</span>
            </div>
          )}
          {search.status === 'failed' && (
            <div className="mt-1 truncate text-xs text-muted-foreground/80">{errorMessage(search.error)}</div>
          )}
        </div>
        <div className="shrink-0 text-right">
          <div className="font-display text-3xl font-light tabular-nums">
            <CountUp value={search.emailsFound} />
          </div>
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

/**
 * The website read sits on the list like a search: running while nvoke reads
 * the site, then planned until the user picks its searches. New search always
 * starts fresh, so this row is the way back to it.
 */
function WebsiteRow() {
  const profile = useSiteProfile();
  const running = useMutationState({
    filters: { mutationKey: BUILD_SITE_PROFILE, status: 'pending' },
    select: (m) => String(m.state.variables ?? ''),
  }).at(-1);
  const reading = running === undefined ? null : (parseWebsite(running)?.domain ?? running);
  if (reading === null && !profile.data) return null;
  const planned = profile.data?.suggestions.length ?? 0;
  const title = reading ?? profile.data!.profile.name;
  return (
    <section className="flex flex-col gap-1 [&+&]:mt-10">
      <div className="group relative rounded-[24px] transition-colors duration-200 hover:bg-foreground/[0.035] has-[a:focus-visible]:bg-foreground/[0.05]">
        <a href={routeHref({ name: 'website' })} aria-label={title} className="absolute inset-0 rounded-[24px] outline-none" />
        <div className="pointer-events-none relative flex items-center gap-8 px-6 py-5">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3">
              {reading !== null && <StatusDot status="running" />}
              <span className={cn('truncate font-display text-lg font-medium', reading !== null && 'font-mono font-normal tracking-tight')}>
                {title}
              </span>
            </div>
            <div className="mt-1 truncate text-sm text-muted-foreground">
              {reading !== null
                ? 'Reading your website, planning searches'
                : `Your website, ${profile.data!.domain}, ${relativeTime(profile.data!.updatedAt)}`}
            </div>
            {reading !== null && (
              <div className="mt-4 h-[3px] w-full max-w-md overflow-hidden rounded-full bg-foreground/[0.07]">
                <div className="h-full w-1/4 rounded-full bg-primary motion-safe:animate-indeterminate" />
              </div>
            )}
          </div>
          {reading === null && (
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

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="flex items-center gap-8 px-6 py-6">
          <div className="flex flex-1 flex-col gap-2.5">
            <Skeleton className="h-4 w-56" />
            <Skeleton className="h-3 w-36" />
          </div>
          <div className="flex flex-col items-end gap-2">
            <Skeleton className="h-7 w-12" />
            <Skeleton className="h-2.5 w-20" />
          </div>
          <span className="w-5" />
        </div>
      ))}
    </div>
  );
}

function Section({ searches, offset = 0 }: { searches: Search[]; offset?: number }) {
  const stagger = useStagger();
  if (searches.length === 0) return null;
  return (
    <section className="stagger flex flex-col gap-1 [&+&]:mt-10">
      {searches.map((s, i) => (
        <SearchRow key={s.id} search={s} style={stagger.style(offset + i)} />
      ))}
    </section>
  );
}

export function SearchesScreen() {
  const { data, error, isPending, refetch } = useSearches();
  const scrollRef = useRef<HTMLElement>(null);
  const active = data?.filter((s) => isActive(s.status)) ?? [];
  const earlier = data?.filter((s) => !isActive(s.status)) ?? [];

  // Only the account needs a refresh here; the list itself is still polled.
  useRefreshWhenFinished(active.length > 0, null);

  const offline = offlineCaption(useLocalStatus().data);
  const subtitle = !data
    ? 'Loading'
    : data.length > 0
      ? [
          `${data.length} ${data.length === 1 ? 'search' : 'searches'}`,
          active.length ? `${active.length} running` : null,
          offline?.toLowerCase(),
        ]
          .filter(Boolean)
          .join(', ')
      : (offline ?? undefined);

  return (
    <>
      <PageHeader
        actions={
          <Button variant="glass" className="pr-4 pl-3" onClick={() => navigate({ name: 'drops' })}>
            <Inbox className="size-[17px] text-muted-foreground" />
            Drops
          </Button>
        }
      />
      <main ref={scrollRef} className="fade-edges flex-1 overflow-auto px-8 pb-24">
        <div className="mx-auto max-w-[880px] motion-safe:animate-view-in">
          <DisplayTitle className="px-6" subtitle={subtitle}>
            Searches
          </DisplayTitle>
          {isPending ? (
            <ListSkeleton />
          ) : error ? (
            <ErrorState error={error} onRetry={() => void refetch()} />
          ) : data.length === 0 ? (
            <>
              <WebsiteRow />
              <EmptyState
                icon={UsersRound}
                title="Who do you sell to?"
                action={
                  <Button size="lg" onClick={() => navigate({ name: 'new', kind: null })}>
                    Describe your customer
                    <ArrowRight />
                  </Button>
                }
              >
                Say it in plain words. nvoke plans the searches, reads every site and finds the people who decide.
              </EmptyState>
            </>
          ) : (
            <>
              <WebsiteRow />
              <Section searches={active} />
              <Section searches={earlier} offset={active.length} />
            </>
          )}
        </div>
      </main>
    </>
  );
}
