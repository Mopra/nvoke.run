'use client';

import { useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowUpRight, MoreHorizontal, Pause, Play, Plus, Send, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { Campaign } from '@nvoke/shared';
import { Count } from '@/components/app/drops/parts';
import { Figure, useArrivals } from '@/components/app/motion';
import { CampaignLed, SendingKeys, SendingNotice } from '@/components/app/sending/parts';
import { APP_FRAME, APP_INSET, LedKey } from '@/components/app/shell';
import { EmptyState, ErrorState } from '@/components/app/states';
import { Readout } from '@/components/mockups/parts';
import { RevealHeading } from '@/components/site/home/reveal';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { formatNumber, periodLabel } from '@/lib/app/desktop';
import {
  CAMPAIGN_STATUS_LABEL,
  campaignLight,
  campaignPath,
  CAMPAIGNS_PATH,
  canPause,
  canResume,
  NEW_CAMPAIGN_PATH,
  scheduleLabel,
  sendingError,
  sourceLabel,
} from '@/lib/app/sending';
import { useCampaignAction, useCampaigns, useDeleteCampaign, useDrops, useSearches, useSendingSummary } from '@/lib/app/queries';
import { cn } from '@/lib/utils';

const GRID =
  'grid grid-cols-[minmax(0,1fr)_auto_28px] items-center gap-x-4 md:grid-cols-[36px_minmax(0,1fr)_170px_150px_28px] lg:grid-cols-[36px_minmax(0,1fr)_200px_170px_28px]';
const ROW =
  'group relative border-t border-border transition-colors duration-200 last:border-b hover:bg-foreground/[0.035] has-[a:focus-visible]:bg-foreground/[0.05]';

function State({ campaign }: { campaign: Campaign }) {
  const light = campaignLight(campaign.status);
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <CampaignLed status={campaign.status} />
      <span className={cn('cap truncate', light === 'busy' || light === 'ready' ? 'text-primary' : 'text-muted-foreground')}>
        {CAMPAIGN_STATUS_LABEL[campaign.status]}
      </span>
    </div>
  );
}

/** Pause, resume and delete, each with its toast. */
export function useCampaignKeys(campaign: Campaign) {
  const action = useCampaignAction();
  function toggle(): void {
    const next = canResume(campaign) ? 'resume' : 'pause';
    action.mutate(
      { id: campaign.id, action: next },
      {
        onSuccess: () => toast(next === 'pause' ? 'Campaign paused' : 'Campaign resumed', { description: campaign.name }),
        onError: (err) => toast.error('Couldn’t change the campaign', { description: sendingError(err) }),
      },
    );
  }
  return { toggle, pending: action.isPending, canToggle: canPause(campaign) || canResume(campaign) };
}

export function DeleteCampaignDialog({
  campaign,
  open,
  onOpenChange,
  leave = false,
}: {
  campaign: Campaign;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leave?: boolean;
}) {
  const remove = useDeleteCampaign();
  const router = useRouter();
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {campaign.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            Nothing more goes out from it and its written emails are gone. Replies already received stay in Replies.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep it</AlertDialogCancel>
          <AlertDialogAction
            onClick={() =>
              remove.mutate(campaign.id, {
                onSuccess: () => {
                  toast.success('Campaign deleted', { description: campaign.name });
                  if (leave) router.replace(CAMPAIGNS_PATH);
                },
                onError: (err) => toast.error('Couldn’t delete the campaign', { description: sendingError(err) }),
              })
            }
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

const MENU_TRIGGER =
  'pointer-events-auto text-muted-foreground sm:pointer-fine:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100 data-[state=open]:bg-accent data-[state=open]:opacity-100';

function CampaignMenu({ campaign }: { campaign: Campaign }) {
  const [confirm, setConfirm] = useState(false);
  const { toggle, pending, canToggle } = useCampaignKeys(campaign);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${campaign.name}`} className={MENU_TRIGGER}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link href={campaignPath(campaign.id)}>
              <ArrowUpRight />
              Open
            </Link>
          </DropdownMenuItem>
          {canToggle && (
            <DropdownMenuItem onSelect={toggle} disabled={pending}>
              {canResume(campaign) ? <Play /> : <Pause />}
              {canResume(campaign) ? 'Resume' : 'Pause'}
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setConfirm(true)}>
            <Trash2 />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <DeleteCampaignDialog campaign={campaign} open={confirm} onOpenChange={setConfirm} />
    </>
  );
}

function CampaignRow({ campaign, detail, index, style }: { campaign: Campaign; detail: string; index: number; style?: CSSProperties }) {
  const busy = campaignLight(campaign.status) === 'busy';
  return (
    <div style={style} className={ROW}>
      <Link href={campaignPath(campaign.id)} aria-label={campaign.name} className="absolute inset-0 outline-none" />
      <div className={cn('pointer-events-none relative py-4', APP_INSET, GRID)}>
        <span className="cap hidden text-muted-foreground md:block">{String(index + 1).padStart(2, '0')}</span>
        <div className="min-w-0">
          <div className="truncate font-display text-base" title={campaign.name}>
            {campaign.name}
          </div>
          <div className="mt-1 truncate font-mono text-[12px] tracking-[0.04em] text-muted-foreground uppercase" title={detail}>
            {detail}
          </div>
          <div className="mt-2 md:hidden">
            <State campaign={campaign} />
          </div>
        </div>
        <div className="hidden md:block">
          <State campaign={campaign} />
        </div>
        <div className="flex items-baseline justify-end gap-3 text-right">
          <span className={cn('font-display text-3xl font-light tracking-[-0.02em] tabular-nums transition-colors duration-500', busy && 'text-primary')}>
            <Figure value={campaign.sent} />
          </span>
          <span className="cap hidden text-muted-foreground lg:inline">{formatNumber(campaign.replied)} replied</span>
        </div>
        <div className="pointer-events-auto -mr-1 flex justify-end">
          <CampaignMenu campaign={campaign} />
        </div>
      </div>
    </div>
  );
}

/** The month on a black display: sends this period, what the mailboxes may send today, unread replies. */
function SummaryDisplay({ className }: { className?: string }) {
  const { data } = useSendingSummary();
  return (
    <section aria-label="Sending this month" className={cn('screen relative overflow-hidden p-5 sm:p-7', className)}>
      <div className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-4">
        <Readout label={data ? `Sent in ${periodLabel(data.period)}` : 'Sent this month'}>
          <Count value={data?.sentThisPeriod ?? null} widest={9999} className="self-start text-[30px] sm:text-[40px]" />
        </Readout>
        <Readout label="Left today">
          <Count value={data?.capacityToday ?? null} widest={999} className="self-start text-[30px] sm:text-[40px]" />
        </Readout>
        <Readout label="Mailboxes active">
          <Count value={data?.mailboxesActive ?? null} widest={99} className="self-start text-[30px] sm:text-[40px]" />
        </Readout>
        <Readout label="Unread replies">
          <Count value={data?.repliesUnread ?? null} widest={99} className="self-start text-[30px] sm:text-[40px]" />
        </Readout>
      </div>
    </section>
  );
}

function TableHead() {
  return (
    <div className={cn(GRID, 'cap hidden pb-2 text-muted-foreground md:grid', APP_INSET)}>
      <span>Ch</span>
      <span>Campaign</span>
      <span>State</span>
      <span className="text-right">Sent</span>
      <span />
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="flex flex-col">
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className={cn('border-t border-border py-5 last:border-b', APP_INSET, GRID)}>
          <Skeleton className="hidden h-3 w-5 md:block" />
          <div className="flex flex-col gap-2.5">
            <Skeleton className="h-4 w-48 max-w-full" />
            <Skeleton className="h-3 w-72 max-w-full" />
          </div>
          <Skeleton className="hidden h-3 w-28 md:block" />
          <Skeleton className="ml-auto h-7 w-12" />
          <span />
        </div>
      ))}
    </div>
  );
}

export function CampaignsScreen() {
  const { data, error, isPending, refetch } = useCampaigns();
  const searches = useSearches();
  const drops = useDrops();
  const campaigns = data?.campaigns ?? [];
  const arrive = useArrivals(campaigns.map((c) => c.id));
  const live = campaigns.filter((c) => c.status === 'sending' || c.status === 'scheduled').length;

  const newKey = (
    <LedKey>
      <Button asChild variant="dark">
        <Link href={NEW_CAMPAIGN_PATH}>
          <Plus />
          New campaign
        </Link>
      </Button>
    </LedKey>
  );

  return (
    <main className={cn(APP_FRAME, 'app-view pb-24')}>
      <div className={cn(APP_INSET, 'flex flex-wrap items-end justify-between gap-x-6 gap-y-4 pt-8 pb-5')}>
        <div className="flex items-start gap-3">
          <RevealHeading as="h1" lines={['Campaigns']} className="font-display text-3xl font-light tracking-[-0.02em] sm:text-4xl" />
          {campaigns.length > 0 && (
            <span className="cap pt-1 text-muted-foreground">
              {campaigns.length}
              {live > 0 && <span className="text-primary"> / {live} live</span>}
            </span>
          )}
        </div>
        <SendingKeys current="campaigns">{campaigns.length > 0 && newKey}</SendingKeys>
      </div>
      <SendingNotice className="mb-6" />
      {!error && <SummaryDisplay className="mb-10 sm:mb-14" />}
      {isPending ? (
        <>
          <TableHead />
          <ListSkeleton />
        </>
      ) : error ? (
        <ErrorState error={new Error(sendingError(error))} onRetry={() => void refetch()} />
      ) : campaigns.length === 0 ? (
        <EmptyState
          icon={Send}
          title="No campaigns yet"
          action={
            <Button asChild size="lg" variant="dark">
              <Link href={NEW_CAMPAIGN_PATH}>
                <Plus />
                New campaign
              </Link>
            </Button>
          }
        >
          Pick a search or a drop, say what each email should do, and Claude writes one per lead. You read them, press Start once, and it sends from your mailboxes in working hours.
        </EmptyState>
      ) : (
        <>
          <TableHead />
          <section className="stagger flex flex-col">
            {campaigns.map((c, i) => (
              <CampaignRow
                key={c.id}
                campaign={c}
                index={i}
                style={arrive(c.id)}
                detail={[sourceLabel(c, searches.data, drops.data?.drops), `${formatNumber(c.leads)} leads`, scheduleLabel(c.schedule)].join(' · ')}
              />
            ))}
          </section>
        </>
      )}
    </main>
  );
}
