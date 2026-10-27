'use client';

import { useState, type CSSProperties, type FormEvent } from 'react';
import { KeyRound, Loader2, Mail, MoreHorizontal, Pause, Play, Plus, RotateCw, Settings2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { MAILBOX_PRESETS, MAX_DAILY_CAP, MAX_MAILBOXES, type Mailbox } from '@nvoke/shared';
import { Figure, useArrivals } from '@/components/app/motion';
import { APP_FRAME, APP_INSET, LedKey } from '@/components/app/shell';
import { EmptyState, ErrorState } from '@/components/app/states';
import { AuthGradeLed, EMAIL_AUTH_PARTS, EmailAuthLeds, FieldRow, MailboxLed, PlateInput, PlateTextarea, SendingKeys, SendingNotice } from '@/components/app/sending/parts';
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
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { formatNumber, relativeTime } from '@/lib/app/desktop';
import {
  applyPreset,
  buildConnectMailbox,
  buildUpdateMailbox,
  emptyMailboxForm,
  MAILBOX_STATUS_LABEL,
  mailboxFormProblem,
  mailboxLoad,
  mailboxSettings,
  presetByKey,
  sendingError,
  withAddress,
  type MailboxForm,
  type MailboxSettings,
} from '@/lib/app/sending';
import { useCheckMailbox, useConnectMailbox, useDeleteMailbox, useMailboxes, useMicrosoftSignIn, useUpdateMailbox } from '@/lib/app/queries';
import { cn } from '@/lib/utils';

/*
 * Mailboxes as instrument channels, like Drops: the channel number, the
 * address and why it is not sending, its state, and today's sends against
 * what it may send. Hairlines between rows, no boxes.
 */
const GRID =
  'grid grid-cols-[minmax(0,1fr)_auto_28px] items-center gap-x-4 md:grid-cols-[36px_minmax(0,1fr)_180px_110px_28px] lg:grid-cols-[36px_minmax(0,1fr)_220px_120px_28px]';
const ROW = 'group relative border-t border-border transition-colors duration-200 last:border-b hover:bg-foreground/[0.035]';

function State({ mailbox }: { mailbox: Mailbox }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <MailboxLed status={mailbox.status} />
      <span className={cn('cap truncate', mailbox.status === 'error' ? 'text-destructive' : mailbox.status === 'checking' ? 'text-primary' : 'text-muted-foreground')}>
        {mailbox.status === 'active' ? (mailbox.warm ? 'Active' : 'Warming up') : MAILBOX_STATUS_LABEL[mailbox.status]}
      </span>
    </div>
  );
}

function MailboxRow({ mailbox, index, onSettings, style }: { mailbox: Mailbox; index: number; onSettings: () => void; style?: CSSProperties }) {
  const detail = [mailbox.address, mailbox.lastSendAt ? `sent ${relativeTime(mailbox.lastSendAt)}` : null, mailboxLoad(mailbox)].filter(Boolean).join(' · ');
  return (
    <div style={style} className={ROW}>
      <div className={cn('relative py-4', APP_INSET, GRID)}>
        <span className="cap hidden text-muted-foreground md:block">{String(index + 1).padStart(2, '0')}</span>
        <div className="min-w-0">
          <button type="button" onClick={onSettings} className="block max-w-full truncate text-left font-display text-base outline-none hover:text-primary focus-visible:text-primary">
            {mailbox.displayName}
          </button>
          <div className="mt-1 truncate font-mono text-[12px] tracking-[0.04em] text-muted-foreground" title={detail}>
            {detail}
          </div>
          {mailbox.emailAuth && <EmailAuthLeds auth={mailbox.emailAuth} className="mt-1.5" />}
          {mailbox.statusReason && mailbox.status !== 'active' && (
            <p className={cn('mt-2 max-w-xl text-sm', mailbox.status === 'error' ? 'text-destructive' : 'text-muted-foreground')}>{mailbox.statusReason}</p>
          )}
          <div className="mt-2 md:hidden">
            <State mailbox={mailbox} />
          </div>
        </div>
        <div className="hidden md:block">
          <State mailbox={mailbox} />
        </div>
        <div className="text-right font-display text-3xl font-light tracking-[-0.02em] tabular-nums">
          <Figure value={mailbox.sentToday} suffix={`/${mailbox.sentToday + mailbox.capacityToday}`} />
        </div>
        <div className="-mr-1 flex justify-end">
          <MailboxMenu mailbox={mailbox} onSettings={onSettings} />
        </div>
      </div>
    </div>
  );
}

const MENU_TRIGGER =
  'text-muted-foreground sm:pointer-fine:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100 data-[state=open]:bg-accent data-[state=open]:opacity-100';

function MailboxMenu({ mailbox, onSettings }: { mailbox: Mailbox; onSettings: () => void }) {
  const [confirm, setConfirm] = useState(false);
  const update = useUpdateMailbox();
  const check = useCheckMailbox();
  const remove = useDeleteMailbox();
  const signIn = useMicrosoftSignIn();
  const paused = mailbox.status === 'paused';

  function togglePaused(): void {
    update.mutate(
      { id: mailbox.id, update: { status: paused ? 'active' : 'paused' } },
      {
        onSuccess: (next) => toast(next.status === 'paused' ? 'Mailbox paused' : 'Mailbox resumed', { description: next.address }),
        onError: (err) => toast.error('Couldn’t change the mailbox', { description: sendingError(err) }),
      },
    );
  }

  function checkAgain(): void {
    check.mutate(mailbox.id, {
      onSuccess: () => toast('Checking the mailbox', { description: 'Logs in over SMTP and IMAP and sends itself a test email.' }),
      onError: (err) => toast.error('Couldn’t check the mailbox', { description: sendingError(err) }),
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${mailbox.address}`} className={MENU_TRIGGER}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={onSettings}>
            <Settings2 />
            Settings
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={checkAgain} disabled={check.isPending || mailbox.status === 'checking'}>
            <RotateCw />
            Check again
          </DropdownMenuItem>
          {mailbox.provider === 'microsoft' && (
            <DropdownMenuItem
              onSelect={() => signIn.mutate(undefined, { onError: (err) => toast.error('Couldn’t start the sign-in', { description: sendingError(err) }) })}
              disabled={signIn.isPending}
            >
              <KeyRound />
              Sign in again
            </DropdownMenuItem>
          )}
          {(mailbox.status === 'active' || paused) && (
            <DropdownMenuItem onSelect={togglePaused} disabled={update.isPending}>
              {paused ? <Play /> : <Pause />}
              {paused ? 'Resume' : 'Pause'}
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setConfirm(true)}>
            <Trash2 />
            Remove
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {mailbox.address}?</AlertDialogTitle>
            <AlertDialogDescription>
              nvoke forgets the {mailbox.provider === 'microsoft' ? 'sign-in' : 'password'} and stops sending from it and reading its replies. Leads it was writing to stay in their campaigns.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                remove.mutate(mailbox.id, {
                  onSuccess: () => toast.success('Mailbox removed', { description: mailbox.address }),
                  onError: (err) => toast.error('Couldn’t remove the mailbox', { description: sendingError(err) }),
                })
              }
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

const DIALOG = 'top-[6vh] max-h-[88vh] max-w-[min(560px,calc(100vw-32px))] overflow-y-auto p-7';
const FORM_GRID = 'grid grid-cols-1 gap-x-5 gap-y-3 sm:grid-cols-[120px_minmax(0,1fr)]';

/**
 * Connect a mailbox: Sign in with Microsoft first (Microsoft 365 and
 * Outlook.com take no password over SMTP and IMAP), then the password form:
 * the address (a known domain fills the servers), the name recipients see,
 * the provider and its servers, the app password last. The server checks it
 * in the background; the row says how it went.
 */
function ConnectDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [form, setForm] = useState<MailboxForm>(emptyMailboxForm);
  const [touched, setTouched] = useState(false);
  const connect = useConnectMailbox();
  const signIn = useMicrosoftSignIn();
  const preset = presetByKey(form.preset);
  const problem = touched ? mailboxFormProblem(form) : null;
  const set = <K extends keyof MailboxForm>(key: K) => (value: MailboxForm[K]) => setForm((f) => ({ ...f, [key]: value }));

  function close(next: boolean): void {
    onOpenChange(next);
    if (!next) {
      setTimeout(() => {
        setForm(emptyMailboxForm());
        setTouched(false);
        connect.reset();
      }, 200);
    }
  }

  function submit(event: FormEvent): void {
    event.preventDefault();
    setTouched(true);
    const input = buildConnectMailbox(form);
    if (!input || connect.isPending) return;
    connect.mutate(input, {
      onSuccess: (mailbox) => {
        toast.success('Mailbox connected', { description: `${mailbox.address}: checking the login and a test email now.` });
        close(false);
      },
      onError: (err) => toast.error('Couldn’t connect the mailbox', { description: sendingError(err) }),
    });
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className={DIALOG}>
        <form onSubmit={submit} className="flex flex-col gap-6" noValidate>
          <div>
            <DialogTitle>Connect a mailbox</DialogTitle>
            <DialogDescription className="mt-1 text-sm text-muted-foreground">
              Campaigns send from it and read its replies over SMTP and IMAP.
            </DialogDescription>
          </div>
          <div className="flex flex-col gap-2">
            <Button
              type="button"
              variant="outline"
              className="w-full justify-center"
              disabled={signIn.isPending}
              onClick={() => signIn.mutate(undefined, { onError: (err) => toast.error('Couldn’t start the sign-in', { description: sendingError(err) }) })}
            >
              {signIn.isPending ? <Loader2 className="motion-safe:animate-spin" /> : <KeyRound />}
              Sign in with Microsoft
            </Button>
            <p className="text-xs text-muted-foreground">Microsoft 365 and Outlook.com. No password: nvoke keeps a sign-in it refreshes, and you can revoke it at any time.</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="h-px flex-1 bg-border" />
            <span className="cap text-muted-foreground">Or with an app password</span>
            <span className="h-px flex-1 bg-border" />
          </div>
          <div className={FORM_GRID}>
            <FieldRow label="Address" htmlFor="mb-address">
              <PlateInput
                id="mb-address"
                type="email"
                autoFocus
                value={form.address}
                onChange={(e) => setForm((f) => withAddress(f, e.target.value))}
                placeholder="you@yourcompany.com"
              />
            </FieldRow>
            <FieldRow label="Name" hint="What recipients see" htmlFor="mb-name">
              <PlateInput id="mb-name" value={form.displayName} onChange={(e) => set('displayName')(e.target.value)} placeholder="Morten from nvoke" maxLength={80} />
            </FieldRow>
            <FieldRow label="Provider" htmlFor="mb-provider">
              <Select value={form.preset} onValueChange={(key) => setForm((f) => applyPreset(f, key))}>
                <SelectTrigger id="mb-provider" className="cap h-8 w-full justify-between rounded-[4px] bg-card px-2.5 shadow-[inset_0_1px_2px_var(--shadow-strong)] focus-visible:ring-[3px] focus-visible:ring-ring/25">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MAILBOX_PRESETS.map((p) => (
                    <SelectItem key={p.key} value={p.key}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1.5 text-xs text-muted-foreground">{preset.help}</p>
            </FieldRow>
            <FieldRow label="SMTP" htmlFor="mb-smtp">
              <div className="flex gap-2">
                <PlateInput id="mb-smtp" value={form.smtpHost} onChange={(e) => set('smtpHost')(e.target.value)} placeholder="smtp.yourhost.com" />
                <PlateInput
                  aria-label="SMTP port"
                  type="number"
                  inputMode="numeric"
                  value={Number.isNaN(form.smtpPort) ? '' : form.smtpPort}
                  onChange={(e) => set('smtpPort')(e.target.valueAsNumber)}
                  className="w-20 shrink-0"
                />
              </div>
            </FieldRow>
            <FieldRow label="IMAP" htmlFor="mb-imap">
              <div className="flex gap-2">
                <PlateInput id="mb-imap" value={form.imapHost} onChange={(e) => set('imapHost')(e.target.value)} placeholder="imap.yourhost.com" />
                <PlateInput
                  aria-label="IMAP port"
                  type="number"
                  inputMode="numeric"
                  value={Number.isNaN(form.imapPort) ? '' : form.imapPort}
                  onChange={(e) => set('imapPort')(e.target.valueAsNumber)}
                  className="w-20 shrink-0"
                />
              </div>
            </FieldRow>
            <FieldRow label="Username" hint="When it is not the address" htmlFor="mb-user">
              <PlateInput id="mb-user" value={form.username} onChange={(e) => set('username')(e.target.value)} placeholder={form.address || 'the address'} />
            </FieldRow>
            <FieldRow label="Already sends" hint="Off: starts at 5 a day and ramps up" htmlFor="mb-warm">
              <div className="flex h-8 items-center">
                <Switch id="mb-warm" checked={form.warm} onCheckedChange={set('warm')} />
              </div>
            </FieldRow>
            <FieldRow label="App password" htmlFor="mb-password">
              <PlateInput id="mb-password" type="password" autoComplete="new-password" value={form.password} onChange={(e) => set('password')(e.target.value)} />
              <p className="mt-1.5 text-xs text-muted-foreground">Stored encrypted. Only the sender uses it.</p>
            </FieldRow>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-3">
            {problem && <span className="mr-auto text-sm text-destructive">{problem}</span>}
            <Button type="button" variant="ghost" onClick={() => close(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="dark" disabled={connect.isPending}>
              {connect.isPending && <Loader2 className="motion-safe:animate-spin" />}
              Connect
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** A mailbox's settings: the name, the daily cap, the signature, the ramp, a new password or a new Microsoft sign-in. */
function SettingsDialog({ mailbox, onOpenChange }: { mailbox: Mailbox | null; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={mailbox !== null} onOpenChange={onOpenChange}>
      <DialogContent className={DIALOG}>{mailbox && <SettingsForm key={mailbox.id} mailbox={mailbox} onDone={() => onOpenChange(false)} />}</DialogContent>
    </Dialog>
  );
}

/** What the last check read from the domain's DNS, with what to fix. It never stops the mailbox. */
function DomainAuth({ auth }: { auth: NonNullable<Mailbox['emailAuth']> }) {
  return (
    <section aria-label={`Email authentication of ${auth.domain}`} className="flex flex-col gap-2">
      <div className="cap text-muted-foreground">{auth.domain}</div>
      <ul className="flex flex-col">
        {EMAIL_AUTH_PARTS.map(([key, label]) => {
          const part = auth[key];
          return (
            <li key={key} className="grid grid-cols-[16px_56px_minmax(0,1fr)] items-baseline gap-x-2 border-t border-border py-2 last:border-b">
              <AuthGradeLed grade={part.grade} className="translate-y-[-1px]" />
              <span className={cn('cap', part.grade === 'fail' ? 'text-destructive' : 'text-muted-foreground')}>{label}</span>
              <span className="text-sm text-muted-foreground">
                {part.notes.length > 0 ? part.notes.join(' ') : 'Set up.'}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function SettingsForm({ mailbox, onDone }: { mailbox: Mailbox; onDone: () => void }) {
  const [form, setForm] = useState<MailboxSettings>(() => mailboxSettings(mailbox));
  const update = useUpdateMailbox();
  const signIn = useMicrosoftSignIn();
  const patch = buildUpdateMailbox(mailbox, form);
  const set = <K extends keyof MailboxSettings>(key: K) => (value: MailboxSettings[K]) => setForm((f) => ({ ...f, [key]: value }));

  function submit(event: FormEvent): void {
    event.preventDefault();
    if (!patch || update.isPending) return;
    update.mutate(
      { id: mailbox.id, update: patch },
      {
        onSuccess: (saved) => {
          toast.success('Mailbox saved', { description: patch.password ? `${saved.address}: checking the new password.` : saved.address });
          onDone();
        },
        onError: (err) => toast.error('Couldn’t save the mailbox', { description: sendingError(err) }),
      },
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-6" noValidate>
      <div>
        <DialogTitle>{mailbox.address}</DialogTitle>
        <DialogDescription className="mt-1 text-sm text-muted-foreground">
          {mailbox.smtpHost}:{mailbox.smtpPort} · {mailbox.imapHost}:{mailbox.imapPort}
        </DialogDescription>
      </div>
      {mailbox.emailAuth && <DomainAuth auth={mailbox.emailAuth} />}
      <div className={FORM_GRID}>
        <FieldRow label="Name" htmlFor="ms-name">
          <PlateInput id="ms-name" value={form.displayName} onChange={(e) => set('displayName')(e.target.value)} maxLength={80} />
        </FieldRow>
        <FieldRow label="A day, at most" hint={`Up to ${MAX_DAILY_CAP}`} htmlFor="ms-cap">
          <PlateInput
            id="ms-cap"
            type="number"
            inputMode="numeric"
            min={1}
            max={MAX_DAILY_CAP}
            value={Number.isNaN(form.dailyCap) ? '' : form.dailyCap}
            onChange={(e) => set('dailyCap')(e.target.valueAsNumber)}
            className="w-24"
          />
        </FieldRow>
        <FieldRow label="Signature" hint="Under every email. Empty: the name" htmlFor="ms-signature">
          <PlateTextarea id="ms-signature" rows={4} value={form.signature} onChange={(e) => set('signature')(e.target.value)} maxLength={1000} placeholder={form.displayName} />
        </FieldRow>
        <FieldRow label="Already sends" hint="Off: ramps up from 5 a day" htmlFor="ms-warm">
          <div className="flex h-8 items-center">
            <Switch id="ms-warm" checked={form.warm} onCheckedChange={set('warm')} />
          </div>
        </FieldRow>
        {mailbox.provider === 'microsoft' ? (
          <FieldRow label="Sign-in" hint="Signs in with Microsoft" htmlFor="ms-signin">
            <Button
              id="ms-signin"
              type="button"
              variant="outline"
              size="sm"
              disabled={signIn.isPending}
              onClick={() => signIn.mutate(undefined, { onError: (err) => toast.error('Couldn’t start the sign-in', { description: sendingError(err) }) })}
            >
              {signIn.isPending ? <Loader2 className="motion-safe:animate-spin" /> : <KeyRound />}
              Sign in again
            </Button>
          </FieldRow>
        ) : (
          <FieldRow label="New password" hint="Reconnects and checks again" htmlFor="ms-password">
            <PlateInput id="ms-password" type="password" autoComplete="new-password" value={form.password} onChange={(e) => set('password')(e.target.value)} />
          </FieldRow>
        )}
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant="dark" disabled={!patch || update.isPending}>
          {update.isPending && <Loader2 className="motion-safe:animate-spin" />}
          Save
        </Button>
      </div>
    </form>
  );
}

function TableHead() {
  return (
    <div className={cn(GRID, 'cap hidden pb-2 text-muted-foreground md:grid', APP_INSET)}>
      <span>Ch</span>
      <span>Mailbox</span>
      <span>State</span>
      <span className="text-right">Today</span>
      <span />
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="flex flex-col">
      {Array.from({ length: 2 }, (_, i) => (
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

export function MailboxesScreen() {
  const { data, error, isPending, refetch } = useMailboxes();
  const [connecting, setConnecting] = useState(false);
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const mailboxes = data?.mailboxes ?? [];
  const arrive = useArrivals(mailboxes.map((m) => m.id));
  const active = mailboxes.filter((m) => m.status === 'active');
  const capacity = active.reduce((n, m) => n + m.capacityToday, 0);
  const full = mailboxes.length >= MAX_MAILBOXES;

  return (
    <main className={cn(APP_FRAME, 'app-view pb-24')}>
      <div className={cn(APP_INSET, 'flex flex-wrap items-end justify-between gap-x-6 gap-y-4 pt-8 pb-5')}>
        <div className="flex items-start gap-3">
          <RevealHeading as="h1" lines={['Mailboxes']} className="font-display text-3xl font-light tracking-[-0.02em] sm:text-4xl" />
          {mailboxes.length > 0 && (
            <span className="cap pt-1 text-muted-foreground">
              {active.length} active<span className="text-primary"> / {formatNumber(capacity)} sends left today</span>
            </span>
          )}
        </div>
        <SendingKeys current="mailboxes">
          {mailboxes.length > 0 && (
            <LedKey>
              <Button variant="dark" onClick={() => setConnecting(true)} disabled={full} title={full ? `You have ${MAX_MAILBOXES} mailboxes.` : undefined}>
                <Plus />
                Connect
              </Button>
            </LedKey>
          )}
        </SendingKeys>
      </div>
      <SendingNotice className="mb-6" />
      {isPending ? (
        <>
          <TableHead />
          <ListSkeleton />
        </>
      ) : error ? (
        <ErrorState error={new Error(sendingError(error))} onRetry={() => void refetch()} />
      ) : mailboxes.length === 0 ? (
        <EmptyState
          icon={Mail}
          title="No mailboxes yet"
          action={
            <Button size="lg" variant="dark" onClick={() => setConnecting(true)}>
              <Plus />
              Connect a mailbox
            </Button>
          }
        >
          Campaigns send from mailboxes you already have, Google Workspace, Microsoft 365 or any SMTP host, and catch the replies there. At most 30 a day each.
        </EmptyState>
      ) : (
        <>
          <TableHead />
          <section className="stagger flex flex-col">
            {mailboxes.map((m, i) => (
              <MailboxRow key={m.id} mailbox={m} index={i} style={arrive(m.id)} onSettings={() => setSettingsId(m.id)} />
            ))}
          </section>
          <p className={cn(APP_INSET, 'mt-6 max-w-xl text-sm text-muted-foreground')}>
            A new mailbox that does not send every day starts at 5 emails and adds 3 a day up to its cap. Sends spread over the recipients’ working hours, at least 4 minutes apart.
          </p>
        </>
      )}
      <ConnectDialog open={connecting} onOpenChange={setConnecting} />
      <SettingsDialog mailbox={mailboxes.find((m) => m.id === settingsId) ?? null} onOpenChange={(open) => !open && setSettingsId(null)} />
    </main>
  );
}
