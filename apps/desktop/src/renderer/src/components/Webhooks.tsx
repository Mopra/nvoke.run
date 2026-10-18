import { useState, type CSSProperties, type FormEvent } from 'react';
import { ChevronDown, Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { WEBHOOK_EVENTS, type Drop, type Webhook, type WebhookEvent } from '@nvoke/shared';
import { CopyField, DocsLink, SectionHeading } from '@/components/ApiKeys';
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
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { WEBHOOK_DOCS_URL } from '@/lib/env';
import { relativeTime } from '@/lib/format';
import { useStagger } from '@/lib/motion';
import { useCreateWebhook, useDeleteWebhook, useDrops, useTestWebhook, useUpdateWebhook, useWebhooks } from '@/lib/queries';
import { cn } from '@/lib/utils';

const EVENT_LABEL: Record<WebhookEvent, string> = {
  'lead.ready': 'New leads',
  'search.finished': 'Finished searches',
};

const EVERY_SEARCH = 'all';
const EVERY_DROP = 'drops';

function scopeLabel(webhook: Webhook, drops: Drop[]): string {
  if (webhook.dropId) return drops.find((d) => d.id === webhook.dropId)?.name ?? 'One drop';
  return webhook.scope === 'drops' ? 'Every drop' : 'Every search';
}

/** How the webhook is doing, in a few words. */
function status(webhook: Webhook): { text: string; tone: 'muted' | 'bad' } {
  if (!webhook.enabled) {
    return webhook.disabledReason === 'failing'
      ? { text: 'Turned off after a day of failures', tone: 'bad' }
      : { text: 'Paused', tone: 'muted' };
  }
  const failedLast =
    webhook.lastFailureAt && (!webhook.lastSuccessAt || webhook.lastFailureAt > webhook.lastSuccessAt);
  if (failedLast) return { text: `Failing: ${webhook.lastError ?? 'no answer'}`, tone: 'bad' };
  if (webhook.lastSuccessAt) return { text: `Delivered ${relativeTime(webhook.lastSuccessAt)}`, tone: 'muted' };
  return { text: 'Nothing sent yet', tone: 'muted' };
}

function WebhookRow({
  webhook,
  drops,
  onDelete,
  style,
}: {
  webhook: Webhook;
  drops: Drop[];
  onDelete: () => void;
  style?: CSSProperties;
}) {
  const test = useTestWebhook();
  const update = useUpdateWebhook();
  const state = status(webhook);

  function sendTest(): void {
    test.mutate(webhook.id, {
      onSuccess: (r) =>
        r.ok
          ? toast.success('Test delivered', { description: `${r.status} in ${r.durationMs} ms` })
          : toast.error('Test failed', { description: r.error ?? `HTTP ${r.status}` }),
      onError: (err) => toast.error('Couldn’t send the test', { description: err.message }),
    });
  }

  function toggle(): void {
    update.mutate(
      { id: webhook.id, update: { enabled: !webhook.enabled } },
      { onError: (err) => toast.error('Couldn’t change the webhook', { description: err.message }) },
    );
  }

  return (
    <li style={style} className="flex items-center gap-6 py-4">
      <div className="min-w-0 flex-1">
        <div className="truncate font-mono text-[13px]" title={webhook.url} data-selectable>
          {webhook.url}
        </div>
        <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 font-mono text-[12px] tracking-[0.04em] text-muted-foreground uppercase">
          <span>{webhook.events.map((e, i) => (i === 0 ? EVENT_LABEL[e] : EVENT_LABEL[e].toLowerCase())).join(' and ')}</span>
          <span>{scopeLabel(webhook, drops)}</span>
          <span className={cn(state.tone === 'bad' && 'text-destructive')}>{state.text}</span>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button variant="ghost" size="sm" onClick={sendTest} disabled={test.isPending}>
          {test.isPending && <Loader2 className="motion-safe:animate-spin" />}
          Send test
        </Button>
        <Button variant="ghost" size="sm" onClick={toggle} disabled={update.isPending}>
          {webhook.enabled ? 'Pause' : 'Resume'}
        </Button>
        <Button variant="ghost" size="sm" onClick={onDelete}>
          Delete
        </Button>
      </div>
    </li>
  );
}

/** A keycap that is on or off, its LED lit while on. */
function Toggle({ on, onClick, children }: { on: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        'key inline-flex h-8 items-center gap-2 bg-secondary px-3 font-mono text-[11px] font-medium tracking-[0.08em] uppercase',
        'outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40',
        on ? 'text-secondary-foreground' : 'text-muted-foreground hover:text-secondary-foreground',
      )}
    >
      <span className={cn('led', on && 'led-on')} aria-hidden />
      {children}
    </button>
  );
}

/** URL, events and scope, then the secret once. */
function NewWebhookDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const create = useCreateWebhook();
  const { data: dropList } = useDrops();
  const drops = dropList?.drops ?? [];
  const [url, setUrl] = useState('');
  const [events, setEvents] = useState<WebhookEvent[]>([...WEBHOOK_EVENTS]);
  const [scope, setScope] = useState(EVERY_SEARCH);
  const [secret, setSecret] = useState<string | null>(null);

  function close(next: boolean): void {
    onOpenChange(next);
    if (!next) {
      // Forget the secret the moment the dialog closes.
      setTimeout(() => {
        setSecret(null);
        setUrl('');
        setEvents([...WEBHOOK_EVENTS]);
        setScope(EVERY_SEARCH);
        create.reset();
      }, 200);
    }
  }

  function flip(event: WebhookEvent): void {
    setEvents((list) => (list.includes(event) ? list.filter((e) => e !== event) : [...list, event]));
  }

  function submit(e: FormEvent): void {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed || events.length === 0) return;
    const target =
      scope === EVERY_SEARCH ? { scope: 'all' as const } : scope === EVERY_DROP ? { scope: 'drops' as const } : { dropId: scope };
    create.mutate(
      { url: trimmed, events, ...target },
      {
        onSuccess: (created) => setSecret(created.secret),
        onError: (err) => toast.error('Couldn’t create the webhook', { description: err.message }),
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="top-[18vh] max-w-[520px] p-7">
        {secret ? (
          <div className="flex flex-col gap-5">
            <div>
              <DialogTitle className="font-display text-xl font-light">Signing secret</DialogTitle>
              <DialogDescription className="mt-1 text-sm text-muted-foreground">
                Signs every request. Copy it now; you won’t see it again.
              </DialogDescription>
            </div>
            <CopyField value={secret} what="signing secret" />
            <div className="flex items-center justify-between gap-2">
              <DocsLink href={WEBHOOK_DOCS_URL} className="-ml-3">
                How to verify
              </DocsLink>
              <Button onClick={() => close(false)}>Done</Button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-5">
            <div>
              <DialogTitle className="font-display text-xl font-light">New webhook</DialogTitle>
              <DialogDescription className="mt-1 text-sm text-muted-foreground">
                We POST each lead to this URL once its emails are verified.
              </DialogDescription>
            </div>
            <Input
              autoFocus
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              maxLength={2000}
              placeholder="https://example.com/hooks/nvoke"
              aria-label="Webhook URL"
              spellCheck={false}
              autoComplete="off"
              autoCapitalize="off"
              className="h-9 rounded-[4px] bg-card px-3 font-mono text-[13px] shadow-[inset_0_1px_2px_var(--shadow-strong)]"
            />
            <div className="flex flex-col gap-2">
              <span className="cap text-muted-foreground">Send</span>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Events">
                {WEBHOOK_EVENTS.map((event) => (
                  <Toggle key={event} on={events.includes(event)} onClick={() => flip(event)}>
                    {EVENT_LABEL[event]}
                  </Toggle>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <span id="webhook-scope" className="cap text-muted-foreground">
                From
              </span>
              <Select value={scope} onValueChange={setScope}>
                <SelectTrigger
                  aria-labelledby="webhook-scope"
                  className="h-9 w-full gap-2 rounded-[4px] bg-card px-3 text-left font-mono text-xs shadow-[inset_0_1px_2px_var(--shadow-strong)] focus-visible:ring-[3px] focus-visible:ring-ring/40"
                >
                  <span className="min-w-0 flex-1 truncate">
                    <SelectValue />
                  </span>
                  <ChevronDown className="size-4 shrink-0 text-muted-foreground/60" />
                </SelectTrigger>
                <SelectContent align="start">
                  <SelectItem value={EVERY_SEARCH}>Every search</SelectItem>
                  <SelectItem value={EVERY_DROP}>Every drop</SelectItem>
                  {drops.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => close(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!url.trim() || events.length === 0 || create.isPending}>
                {create.isPending && <Loader2 className="motion-safe:animate-spin" />}
                Create webhook
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function DeleteDialog({ webhook, onOpenChange }: { webhook: Webhook | null; onOpenChange: (open: boolean) => void }) {
  const remove = useDeleteWebhook();
  // Keeps the URL on screen while the dialog fades out after `webhook` clears.
  const [shown, setShown] = useState(webhook);
  if (webhook && webhook !== shown) setShown(webhook);
  return (
    <AlertDialog open={webhook !== null} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this webhook?</AlertDialogTitle>
          <AlertDialogDescription className="break-all">
            {shown?.url} stops getting leads at once, and anything still queued for it is dropped.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep it</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              if (!webhook) return;
              remove.mutate(webhook.id, {
                onSuccess: () => toast.success('Webhook deleted'),
                onError: (err) => toast.error('Couldn’t delete the webhook', { description: err.message }),
              });
            }}
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function Webhooks() {
  const { data: webhooks, error, isPending, refetch } = useWebhooks();
  const { data: dropList } = useDrops();
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<Webhook | null>(null);
  const stagger = useStagger();

  return (
    <section data-webhooks>
      <SectionHeading
        title="Webhooks"
        description="Leads pushed to your URL the moment they’re verified."
        action={
          <div className="flex items-center gap-1">
            <DocsLink href={WEBHOOK_DOCS_URL}>Docs</DocsLink>
            <Button variant="outline" onClick={() => setCreating(true)}>
              <Plus />
              New webhook
            </Button>
          </div>
        }
      />
      <div className="mt-4">
        {isPending ? (
          <div className="flex flex-col gap-3 py-4">
            <Skeleton className="h-4 w-64" />
            <Skeleton className="h-3 w-48" />
          </div>
        ) : error ? (
          <p className="py-4 text-sm text-muted-foreground">
            Couldn’t load your webhooks.{' '}
            <button
              type="button"
              className="rounded-sm text-foreground underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/50"
              onClick={() => void refetch()}
            >
              Try again
            </button>
          </p>
        ) : webhooks.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">No webhooks yet.</p>
        ) : (
          <ul className="stagger flex flex-col divide-y divide-border">
            {webhooks.map((w, i) => (
              <WebhookRow key={w.id} webhook={w} drops={dropList?.drops ?? []} onDelete={() => setDeleting(w)} style={stagger.style(i)} />
            ))}
          </ul>
        )}
      </div>
      <NewWebhookDialog open={creating} onOpenChange={setCreating} />
      <DeleteDialog webhook={deleting} onOpenChange={(open) => !open && setDeleting(null)} />
    </section>
  );
}
