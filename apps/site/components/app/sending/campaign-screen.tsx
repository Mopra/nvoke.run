'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { ChevronDown, Loader2, Pause, Play, Send, Settings2, Square, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { Campaign, CampaignLead, Message, WrittenStep } from '@nvoke/shared';
import { Count } from '@/components/app/drops/parts';
import { LogoLoader } from '@/components/app/motion';
import { CampaignFields } from '@/components/app/sending/campaign-form';
import { DeleteCampaignDialog, useCampaignKeys } from '@/components/app/sending/campaigns-screen';
import { CampaignLed, PlateInput, PlateTextarea, SendingNotice } from '@/components/app/sending/parts';
import { Pill } from '@/components/app/sentence';
import { APP_FRAME, APP_INSET, BackLink, PageHeader } from '@/components/app/shell';
import { EmptyState, ErrorState } from '@/components/app/states';
import { METER_SEGMENTS, Readout, ScreenMeter } from '@/components/mockups/parts';
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
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError } from '@/lib/app/api';
import { countryName, formatNumber, relativeTime } from '@/lib/app/desktop';
import {
  buildUpdateCampaign,
  CAMPAIGN_STATUS_LABEL,
  campaignForm,
  campaignFormProblem,
  campaignLight,
  campaignNote,
  campaignPollInterval,
  CAMPAIGNS_PATH,
  canEditLead,
  canStart,
  clockTime,
  LEAD_FILTERS,
  LEAD_STATUS_LABEL,
  leadName,
  reviewEnds,
  scheduleLabel,
  sendingError,
  skippedLines,
  skipReasonLabel,
  skippedTotal,
  sourceLabel,
  type CampaignForm,
  type LeadFilter,
} from '@/lib/app/sending';
import {
  useCampaign,
  useCampaignAction,
  useCampaignLead,
  useCampaignLeads,
  useDrops,
  useMailboxes,
  useSearches,
  useStopLead,
  useUpdateCampaign,
  useUpdateWrittenStep,
} from '@/lib/app/queries';
import { cn } from '@/lib/utils';

/**
 * A campaign's page: its display (state, counts, who was skipped), Start
 * while it waits for review, the leads with every written email (edit in
 * place, stop a lead) and the settings. `lead` opens one lead, as Replies
 * links to it.
 */
export function CampaignScreen({ id, lead }: { id: string; lead?: string }) {
  const { data: campaign, error, isPending, refetch } = useCampaign(id);
  if (isPending) {
    return (
      <main className={cn(APP_FRAME, 'app-view')}>
        <LogoLoader page label="Loading the campaign" />
      </main>
    );
  }
  if (!campaign) {
    const gone = error instanceof ApiError && (error.status === 404 || error.status === 400);
    return (
      <main className={cn(APP_FRAME, 'app-view pb-24')}>
        <PageHeader leading={<BackLink href={CAMPAIGNS_PATH} label="Campaigns" />} />
        {gone ? (
          <EmptyState
            icon={Send}
            title="This campaign is gone"
            action={
              <Button asChild variant="secondary">
                <Link href={CAMPAIGNS_PATH}>All campaigns</Link>
              </Button>
            }
          >
            Probably deleted in another tab.
          </EmptyState>
        ) : (
          <ErrorState error={new Error(sendingError(error))} onRetry={() => void refetch()} />
        )}
      </main>
    );
  }
  return <CampaignPage campaign={campaign} initialLead={lead ?? null} />;
}

function CampaignPage({ campaign, initialLead }: { campaign: Campaign; initialLead: string | null }) {
  const [confirm, setConfirm] = useState(false);
  const [editing, setEditing] = useState(false);
  const { toggle, pending, canToggle } = useCampaignKeys(campaign);
  const paused = campaign.status === 'paused';

  return (
    <main className={cn(APP_FRAME, 'app-view pb-24')}>
      <PageHeader
        leading={<BackLink href={CAMPAIGNS_PATH} label="Campaigns" />}
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={() => setEditing((e) => !e)} aria-expanded={editing}>
              <Settings2 />
              Settings
            </Button>
            {canToggle && (
              <Button variant="secondary" size="sm" onClick={toggle} disabled={pending}>
                {paused ? <Play /> : <Pause />}
                {paused ? 'Resume' : 'Pause'}
              </Button>
            )}
            <Button variant="ghost" size="icon-sm" aria-label={`Delete ${campaign.name}`} onClick={() => setConfirm(true)}>
              <Trash2 />
            </Button>
            <DeleteCampaignDialog campaign={campaign} open={confirm} onOpenChange={setConfirm} leave />
          </>
        }
      />
      <h1 className="sr-only">{campaign.name}</h1>
      <SendingNotice className="mt-6" />
      <CampaignDisplay campaign={campaign} className="mt-6" />
      {canStart(campaign) && <StartPanel campaign={campaign} />}
      {editing && <SettingsPanel campaign={campaign} onDone={() => setEditing(false)} />}
      <Leads campaign={campaign} initialLead={initialLead} />
    </main>
  );
}

/**
 * The campaign on a black display: its LED and state, what it is doing now,
 * the name in dot matrix and the leads enrolled, a meter of how many are
 * written (while writing) or sent to, and the outcomes under it.
 */
function CampaignDisplay({ campaign, className }: { campaign: Campaign; className?: string }) {
  const searches = useSearches();
  const drops = useDrops();
  const light = campaignLight(campaign.status);
  const writing = campaign.status === 'writing' || campaign.status === 'draft';
  const scale = Math.max(1, campaign.leads);
  const lit = Math.round(((writing ? campaign.leads - campaign.writing : campaign.sent) / scale) * METER_SEGMENTS);
  const skipped = skippedLines(campaign.skipped);
  const summary = [sourceLabel(campaign, searches.data, drops.data?.drops), scheduleLabel(campaign.schedule), `${campaign.steps.length} emails`].join(' · ');

  return (
    <section aria-label={campaign.name} className={cn('screen screen-hero relative overflow-hidden p-5 sm:p-8', className)}>
      <div className="flex flex-wrap items-center gap-3">
        <CampaignLed status={campaign.status} screen />
        <span className={cn('cap', light === 'busy' || light === 'ready' ? 'text-primary' : 'text-screen-foreground/70')}>
          {CAMPAIGN_STATUS_LABEL[campaign.status]}
          {campaign.autopilot && ' · Autopilot'}
        </span>
        <span className="cap ml-auto truncate text-screen-foreground/60">{campaignNote(campaign)}</span>
      </div>

      <div className="mt-6 flex flex-wrap items-end justify-between gap-x-8 gap-y-4 sm:mt-8">
        <div className="w-full min-w-0 sm:w-auto sm:flex-1">
          <p className="lcd truncate text-[24px] leading-tight uppercase sm:text-[40px]" title={campaign.name}>
            {campaign.name}
          </p>
          <p className="cap mt-2 truncate text-screen-foreground/60" title={summary}>
            {summary}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
          <span className="cap text-screen-foreground/60">Leads</span>
          <span aria-hidden className="block pt-2 sm:pt-3">
            <Count value={campaign.leads} widest={Math.max(999, campaign.leads)} className="text-[44px] sm:text-[64px]" />
          </span>
          <span className="sr-only">{formatNumber(campaign.leads)} leads</span>
        </div>
      </div>

      <div className="mt-5">
        <ScreenMeter lit={Math.min(METER_SEGMENTS, lit)} dim={writing ? METER_SEGMENTS : 0} />
      </div>

      <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-5 border-t border-screen-dim pt-5 sm:mt-8 sm:grid-cols-5 sm:pt-6">
        <Readout label="Sent">
          <Count value={campaign.sent} widest={999} className="self-start text-[30px] sm:text-[40px]" />
        </Readout>
        <Readout label="Replied">
          <Count value={campaign.replied} widest={99} className="self-start text-[30px] sm:text-[40px]" />
        </Readout>
        <Readout label="Bounced">
          <Count value={campaign.bounced} widest={99} className="self-start text-[30px] sm:text-[40px]" />
        </Readout>
        <Readout label="Opted out">
          <Count value={campaign.optedOut} widest={99} className="self-start text-[30px] sm:text-[40px]" />
        </Readout>
        <Readout label="Skipped">
          <Count value={skippedTotal(campaign.skipped)} widest={99} className="self-start text-[30px] sm:text-[40px]" />
        </Readout>
      </div>
      {skipped.length > 0 && (
        <ul className="mt-5 flex flex-wrap gap-x-6 gap-y-1.5" aria-label="Skipped, by reason">
          {skipped.map((s) => (
            <li key={s.reason} className="cap text-screen-foreground/60">
              {s.label} <span className="text-screen-foreground">{formatNumber(s.count)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Start, with the hour of review: the one press after which the campaign runs on its own. */
function StartPanel({ campaign }: { campaign: Campaign }) {
  const [confirm, setConfirm] = useState(false);
  const action = useCampaignAction();
  const at = clockTime(reviewEnds());

  function start(): void {
    action.mutate(
      { id: campaign.id, action: 'start' },
      {
        onSuccess: () => toast.success('Campaign started', { description: `The first email goes out no earlier than ${at}.` }),
        onError: (err) => toast.error('Couldn’t start the campaign', { description: sendingError(err) }),
      },
    );
  }

  return (
    <section className={cn(APP_INSET, 'mt-10 flex flex-col gap-4 border-y border-border py-6 sm:flex-row sm:items-center sm:gap-8')}>
      <div className="min-w-0 flex-1">
        <p className="font-display text-xl font-light">Read the emails below, then start.</p>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          After Start you have an hour to stop anything: the first email goes out no earlier than {at}, in each recipient’s working hours.
          {campaign.autopilot &&
            ` From then on every new lead is written and sent ${campaign.holdHours} h later without asking. Pause stops it at any time.`}
        </p>
      </div>
      <Button size="lg" onClick={() => setConfirm(true)} disabled={action.isPending || campaign.leads === 0} className="min-w-36">
        {action.isPending ? <Loader2 className="motion-safe:animate-spin" /> : <Send />}
        Start
      </Button>
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Start {campaign.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              {formatNumber(campaign.leads)} leads, sent from your mailboxes from {at} on.
              {campaign.autopilot && ' New leads keep coming in and go out on their own.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Not yet</AlertDialogCancel>
            <AlertDialogAction onClick={start}>Start</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

/** The campaign's settings, edited in place. Changes apply to leads written from now on. */
function SettingsPanel({ campaign, onDone }: { campaign: Campaign; onDone: () => void }) {
  const [form, setForm] = useState<CampaignForm>(() => campaignForm(campaign));
  const mailboxes = useMailboxes().data?.mailboxes ?? [];
  const searches = useSearches();
  const drops = useDrops();
  const update = useUpdateCampaign();
  const patch = buildUpdateCampaign(campaign, form);
  const problem = campaignFormProblem(form, true);

  function submit(event: FormEvent): void {
    event.preventDefault();
    if (!patch || update.isPending) return;
    update.mutate(
      { id: campaign.id, update: patch },
      {
        onSuccess: (saved) => {
          toast.success('Campaign saved', { description: `${saved.name}: changes apply to leads written from now on.` });
          onDone();
        },
        onError: (err) => toast.error('Couldn’t save the campaign', { description: sendingError(err) }),
      },
    );
  }

  return (
    <form onSubmit={submit} className={cn(APP_INSET, 'mt-12 max-w-4xl')} noValidate>
      <CampaignFields form={form} setForm={setForm} mailboxes={mailboxes} searches={searches.data} drops={drops.data?.drops} editing />
      <div className="mt-8 flex flex-wrap items-center gap-4 border-t border-border pt-6">
        <Button type="submit" variant="dark" disabled={!patch || update.isPending}>
          {update.isPending && <Loader2 className="motion-safe:animate-spin" />}
          Save settings
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        {problem ? (
          <span className="text-sm text-destructive">{problem}</span>
        ) : (
          <span className="text-sm text-muted-foreground">Emails already written stay as they are.</span>
        )}
      </div>
    </form>
  );
}

const FILTER_LABEL: Record<LeadFilter, string> = { all: 'All', ...LEAD_STATUS_LABEL };

/** The leads, filtered by state, each opening to its written emails and thread. */
function Leads({ campaign, initialLead }: { campaign: Campaign; initialLead: string | null }) {
  const [filter, setFilter] = useState<LeadFilter>('all');
  const [open, setOpen] = useState<string | null>(initialLead);
  const leads = useCampaignLeads(campaign.id, filter, campaignPollInterval(campaign));
  const list = leads.data?.pages.flatMap((p) => p.leads) ?? [];

  return (
    <section className="mt-16" aria-label="Leads">
      <div className={cn(APP_INSET, 'flex flex-wrap items-end justify-between gap-4 pb-4')}>
        <h2 className="font-display text-2xl font-light tracking-[-0.01em]">Leads</h2>
        <div className="flex flex-wrap gap-1" role="group" aria-label="Show leads">
          {LEAD_FILTERS.map((f) => (
            <Pill key={f} pressed={filter === f} onClick={() => setFilter(f)}>
              {FILTER_LABEL[f]}
            </Pill>
          ))}
        </div>
      </div>
      {leads.isPending ? (
        <div className="flex flex-col">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className={cn('flex gap-4 border-t border-border py-4 last:border-b', APP_INSET)}>
              <Skeleton className="h-4 w-56 max-w-full" />
              <Skeleton className="ml-auto h-3 w-24" />
            </div>
          ))}
        </div>
      ) : leads.error ? (
        <ErrorState error={new Error(sendingError(leads.error))} onRetry={() => void leads.refetch()} />
      ) : list.length === 0 ? (
        <p className={cn(APP_INSET, 'border-t border-border py-10 text-sm text-muted-foreground')}>
          {filter !== 'all'
            ? `No lead is ${FILTER_LABEL[filter].toLowerCase()}.`
            : campaign.writing > 0 || campaign.status === 'writing'
              ? 'Claude is writing the first emails. They show here as they come.'
              : campaign.autopilot
                ? 'No leads yet. New verified leads from the source are enrolled every few minutes.'
                : 'No lead could be enrolled. The skipped counts above say why.'}
        </p>
      ) : (
        <div className="flex flex-col">
          {list.map((l) => (
            <LeadRow key={l.id} campaign={campaign} lead={l} open={open === l.id} onToggle={() => setOpen((o) => (o === l.id ? null : l.id))} />
          ))}
          {leads.hasNextPage && (
            <div className={cn(APP_INSET, 'pt-6')}>
              <Button variant="secondary" size="sm" onClick={() => void leads.fetchNextPage()} disabled={leads.isFetchingNextPage}>
                {leads.isFetchingNextPage && <Loader2 className="motion-safe:animate-spin" />}
                More leads
              </Button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function leadLed(status: CampaignLead['status']): string {
  if (status === 'writing' || status === 'active') return 'led-on motion-safe:animate-blink';
  if (status === 'queued') return 'led-on';
  if (status === 'replied') return 'bg-chart-1 shadow-[0_0_6px_var(--chart-1)]';
  if (status === 'bounced' || status === 'failed') return 'bg-destructive';
  return 'bg-muted-foreground/35';
}

function LeadRow({ campaign, lead, open, onToggle }: { campaign: Campaign; lead: CampaignLead; open: boolean; onToggle: () => void }) {
  const who = [lead.title, lead.companyName, lead.country ? countryName(lead.country) : null].filter(Boolean).join(' · ');
  const when =
    lead.nextSendAt && canEditLead(lead.status)
      ? `${lead.nextStep > 1 ? `Email ${lead.nextStep}` : 'First email'} ${relativeOrClock(lead.nextSendAt)}`
      : lead.skipReason && (lead.status === 'skipped' || lead.status === 'failed')
        ? skipReasonLabel(lead.skipReason)
        : null;
  return (
    <div className={cn('border-t border-border last:border-b', open && 'bg-foreground/[0.02]')}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className={cn(
          APP_INSET,
          'grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 py-3.5 text-left outline-none transition-colors hover:bg-foreground/[0.035] focus-visible:bg-foreground/[0.05] md:grid-cols-[minmax(0,1fr)_180px_160px_20px]',
        )}
      >
        <div className="min-w-0">
          <div className="truncate font-display text-base">{leadName(lead)}</div>
          <div className="mt-0.5 truncate font-mono text-[12px] text-muted-foreground">
            {lead.address}
            {who && ` · ${who}`}
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <span aria-hidden className={cn('led', leadLed(lead.status))} />
          <span className="cap truncate text-muted-foreground">{LEAD_STATUS_LABEL[lead.status]}</span>
        </div>
        <span className="cap hidden truncate text-right text-muted-foreground md:block">{when}</span>
        <ChevronDown className={cn('hidden size-4 text-muted-foreground transition-transform md:block', open && 'rotate-180')} />
      </button>
      {open && <LeadDetail campaign={campaign} lead={lead} />}
    </div>
  );
}

/** "in 3 h" or "at 14:20" for a send ahead, "2 h ago" for one behind. */
function relativeOrClock(iso: string, now: number = Date.now()): string {
  const at = Date.parse(iso);
  if (at <= now) return 'due now';
  const hours = (at - now) / 3_600_000;
  if (hours < 1) return `in ${Math.max(1, Math.round(hours * 60))} min`;
  if (hours < 20) return `at ${clockTime(at)}`;
  return `on ${new Date(at).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}`;
}

/** One lead open: every written email (editable until sent), the thread so far, and Stop. */
function LeadDetail({ campaign, lead }: { campaign: Campaign; lead: CampaignLead }) {
  const { data, isPending, error, refetch } = useCampaignLead(campaign.id, lead.id);
  const stop = useStopLead(campaign.id);
  const editable = canEditLead(lead.status);

  function stopLead(): void {
    stop.mutate(lead.id, {
      onSuccess: () => toast('Lead stopped', { description: `Nothing more goes to ${lead.address} from this campaign.` }),
      onError: (err) => toast.error('Couldn’t stop the lead', { description: sendingError(err) }),
    });
  }

  return (
    <div className={cn(APP_INSET, 'flex flex-col gap-6 pt-2 pb-8')}>
      {isPending ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-8 w-full max-w-xl" />
          <Skeleton className="h-28 w-full max-w-xl" />
        </div>
      ) : error ? (
        <ErrorState error={new Error(sendingError(error))} onRetry={() => void refetch()} className="py-8" />
      ) : data ? (
        <>
          {data.steps.length === 0 ? (
            <p className="text-sm text-muted-foreground">{lead.status === 'writing' ? 'Claude is writing this lead’s emails.' : 'No emails written for this lead.'}</p>
          ) : (
            data.steps.map((s) => <StepEditor key={s.step} campaignId={campaign.id} leadId={lead.id} step={s} editable={editable && !s.sentAt} wait={campaign.steps[s.step - 1]?.waitDays ?? 0} />)
          )}
          {data.messages.length > 0 && <Thread messages={data.messages} />}
        </>
      ) : null}
      {editable && (
        <div>
          <Button variant="secondary" size="sm" onClick={stopLead} disabled={stop.isPending}>
            {stop.isPending ? <Loader2 className="motion-safe:animate-spin" /> : <Square />}
            Stop this lead
          </Button>
        </div>
      )}
    </div>
  );
}

function StepEditor({ campaignId, leadId, step, editable, wait }: { campaignId: string; leadId: string; step: WrittenStep; editable: boolean; wait: number }) {
  const [subject, setSubject] = useState(step.subject);
  const [body, setBody] = useState(step.body);
  const update = useUpdateWrittenStep(campaignId);
  const changed = subject.trim() !== step.subject || body.trim() !== step.body;

  function save(event: FormEvent): void {
    event.preventDefault();
    if (!changed || !subject.trim() || !body.trim() || update.isPending) return;
    update.mutate(
      { leadId, step: step.step, update: { ...(subject.trim() !== step.subject ? { subject: subject.trim() } : {}), ...(body.trim() !== step.body ? { body: body.trim() } : {}) } },
      {
        onSuccess: () => toast.success(`Email ${step.step} saved`),
        onError: (err) => toast.error('Couldn’t save the email', { description: sendingError(err) }),
      },
    );
  }

  const label = step.step === 1 ? 'Email 1' : `Email ${step.step}, ${wait} days later`;
  return (
    <form onSubmit={save} className="flex max-w-2xl flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="cap text-foreground">{label}</span>
        {step.edited && <span className="cap text-muted-foreground">Edited</span>}
        {step.sentAt && <span className="cap text-primary">Sent {relativeTime(step.sentAt)}</span>}
      </div>
      <PlateInput aria-label={`Subject of email ${step.step}`} value={subject} onChange={(e) => setSubject(e.target.value)} disabled={!editable} maxLength={200} />
      <PlateTextarea aria-label={`Body of email ${step.step}`} rows={7} value={body} onChange={(e) => setBody(e.target.value)} disabled={!editable} maxLength={5000} className="font-sans text-sm" />
      {editable && changed && (
        <div className="flex gap-2">
          <Button type="submit" size="sm" variant="dark" disabled={update.isPending || !subject.trim() || !body.trim()}>
            {update.isPending && <Loader2 className="motion-safe:animate-spin" />}
            Save email
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              setSubject(step.subject);
              setBody(step.body);
            }}
          >
            Undo
          </Button>
        </div>
      )}
    </form>
  );
}

const KIND_LABEL: Record<Message['kind'], string> = { step: 'Sent', reply: 'Reply', auto_reply: 'Auto reply', bounce: 'Bounce', other: 'Other' };

/** The thread with this lead: what went out and what came back, oldest first. */
function Thread({ messages }: { messages: Message[] }) {
  const sorted = [...messages].sort((a, b) => a.at.localeCompare(b.at));
  return (
    <div className="flex max-w-2xl flex-col gap-3">
      <span className="cap text-foreground">Thread</span>
      <ol className="flex flex-col">
        {sorted.map((m) => (
          <li key={m.id} className="border-t border-border py-3 first:border-t-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className={cn('cap', m.direction === 'in' ? 'text-primary' : 'text-muted-foreground')}>
                {KIND_LABEL[m.kind]}
                {m.step ? ` ${m.step}` : ''}
              </span>
              <span className="truncate text-sm">{m.subject}</span>
              <span className="cap ml-auto text-muted-foreground">{relativeTime(m.at)}</span>
            </div>
            {m.bodyText && <p className="mt-2 text-sm whitespace-pre-line text-muted-foreground">{m.bodyText}</p>}
          </li>
        ))}
      </ol>
    </div>
  );
}
